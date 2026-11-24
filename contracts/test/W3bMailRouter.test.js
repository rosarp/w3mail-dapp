const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const MAX_INBOX = 1000n;

async function deployFixture() {
  const [admin, alice, bob, eve] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory('PubKeyRegistry');
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const Router = await ethers.getContractFactory('W3bMailRouter');
  const router = await upgrades.deployProxy(
    Router,
    [await registry.getAddress(), MAX_INBOX],
    { kind: 'uups', initializer: 'initialize' },
  );
  await router.waitForDeployment();

  // Register pubkeys for alice + bob (eve has no key — used for negative tests)
  await registry.connect(alice).registerPubKey(ethers.randomBytes(32));
  await registry.connect(bob).registerPubKey(ethers.randomBytes(32));

  return { registry, router, admin, alice, bob, eve };
}

describe('W3bMailRouter', () => {
  describe('sendMessage', () => {
    it('alice → bob: appends inbox + sent + cid index, emits MessageSent', async () => {
      const { router, alice, bob } = await deployFixture();
      const cid = ethers.keccak256(ethers.toUtf8Bytes('msg-1'));
      const msgId = '01926f1f-1234-7abc-8000-000000000001';

      await expect(router.connect(alice).sendMessage(bob.address, cid, msgId))
        .to.emit(router, 'MessageSent')
        .withArgs(alice.address, bob.address, msgId)
        .and.to.emit(router, 'MessageCidAdded')
        .withArgs(bob.address, cid);

      expect(await router.getActiveInboxCount(bob.address)).to.equal(1n);
      expect(await router.getMessageCount(bob.address)).to.equal(1n);

      const [page, total] = await router.connect(bob).getInboxPage(0, 10);
      expect(total).to.equal(1n);
      expect(page.length).to.equal(1);
      expect(page[0].sender).to.equal(alice.address);
      expect(page[0].messageCid).to.equal(cid);
      expect(page[0].deleted).to.equal(false);

      const [sentPage, sentTotal] = await router.connect(alice).getSentPage(0, 10);
      expect(sentTotal).to.equal(1n);
      expect(sentPage[0].receiver).to.equal(bob.address);
    });

    it('rejects when receiver has no pubkey', async () => {
      const { router, alice, eve } = await deployFixture();
      const cid = ethers.keccak256(ethers.toUtf8Bytes('msg-x'));
      await expect(
        router.connect(alice).sendMessage(eve.address, cid, 'mid-x'),
      ).to.be.revertedWith('Receiver has no public key');
    });

    it('rejects zero address / empty cid / bad msgId', async () => {
      const { router, alice, bob } = await deployFixture();
      const cid = ethers.keccak256(ethers.toUtf8Bytes('msg'));
      await expect(router.connect(alice).sendMessage(ethers.ZeroAddress, cid, 'm')).to.be.revertedWith('Zero receiver');
      await expect(router.connect(alice).sendMessage(bob.address, ethers.ZeroHash, 'm')).to.be.revertedWith('Empty CID');
      await expect(router.connect(alice).sendMessage(bob.address, cid, '')).to.be.revertedWith('Bad msgId');
    });

    it('rejects when inbox is full', async () => {
      const { router, registry, admin, alice, bob } = await deployFixture();
      // shrink cap for test speed
      await router.connect(admin).setMaxInboxSize(2);

      const cid = ethers.keccak256(ethers.toUtf8Bytes('a'));
      await router.connect(alice).sendMessage(bob.address, cid, 'm1');
      await router.connect(alice).sendMessage(bob.address, cid, 'm2');
      await expect(router.connect(alice).sendMessage(bob.address, cid, 'm3')).to.be.revertedWith('Receiver inbox full');
      // suppress unused-var
      void registry;
    });
  });

  describe('deleteMessages', () => {
    it('marks deleted, removes from CID index, emits MessageDeleted', async () => {
      const { router, alice, bob } = await deployFixture();
      const cid1 = ethers.keccak256(ethers.toUtf8Bytes('m1'));
      const cid2 = ethers.keccak256(ethers.toUtf8Bytes('m2'));
      await router.connect(alice).sendMessage(bob.address, cid1, 'mid-1');
      await router.connect(alice).sendMessage(bob.address, cid2, 'mid-2');

      expect(await router.getActiveInboxCount(bob.address)).to.equal(2n);
      expect(await router.getMessageCount(bob.address)).to.equal(2n);

      await expect(router.connect(bob).deleteMessages(['mid-1']))
        .to.emit(router, 'MessageDeleted')
        .withArgs(bob.address, 'mid-1')
        .and.to.emit(router, 'MessageCidRemoved')
        .withArgs(bob.address, cid1);

      expect(await router.getActiveInboxCount(bob.address)).to.equal(1n);
      expect(await router.getMessageCount(bob.address)).to.equal(1n);

      const [page] = await router.connect(bob).getInboxPage(0, 10);
      expect(page[0].deleted).to.equal(true);
      expect(page[1].deleted).to.equal(false);
    });

    it('caller can only delete from own inbox', async () => {
      const { router, alice, bob } = await deployFixture();
      const cid = ethers.keccak256(ethers.toUtf8Bytes('m'));
      await router.connect(alice).sendMessage(bob.address, cid, 'mid-1');
      // alice tries to delete from her own (empty) inbox — no-op, no revert
      await router.connect(alice).deleteMessages(['mid-1']);
      // bob's inbox unchanged
      expect(await router.getActiveInboxCount(bob.address)).to.equal(1n);
    });
  });

  describe('pagination', () => {
    it('getInboxPage handles offset beyond length', async () => {
      const { router, alice, bob } = await deployFixture();
      const cid = ethers.keccak256(ethers.toUtf8Bytes('m'));
      await router.connect(alice).sendMessage(bob.address, cid, 'mid-1');

      const [page, total] = await router.connect(bob).getInboxPage(10, 5);
      expect(total).to.equal(1n);
      expect(page.length).to.equal(0);
    });

    it('getInboxPage clamps end to total', async () => {
      const { router, alice, bob } = await deployFixture();
      for (let i = 0; i < 5; i++) {
        await router.connect(alice).sendMessage(
          bob.address,
          ethers.keccak256(ethers.toUtf8Bytes('m' + i)),
          'mid-' + i,
        );
      }
      const [page, total] = await router.connect(bob).getInboxPage(3, 100);
      expect(total).to.equal(5n);
      expect(page.length).to.equal(2);
    });
  });

  describe('access control', () => {
    it('only ADMIN_ROLE can setMaxInboxSize', async () => {
      const { router, alice } = await deployFixture();
      await expect(router.connect(alice).setMaxInboxSize(50))
        .to.be.revertedWithCustomError(router, 'AccessControlUnauthorizedAccount');
    });

    it('admin can adjust max inbox size', async () => {
      const { router, admin } = await deployFixture();
      await router.connect(admin).setMaxInboxSize(50);
      expect(await router.maxInboxSize()).to.equal(50n);
    });
  });

  describe('upgrade safety', () => {
    it('non-admin cannot upgrade', async () => {
      const { router, alice } = await deployFixture();
      const Router = await ethers.getContractFactory('W3bMailRouter', alice);
      await expect(upgrades.upgradeProxy(await router.getAddress(), Router))
        .to.be.revertedWithCustomError(router, 'AccessControlUnauthorizedAccount');
    });

    it('admin can upgrade preserving state', async () => {
      const { router, admin, alice, bob } = await deployFixture();
      await router.connect(alice).sendMessage(
        bob.address,
        ethers.keccak256(ethers.toUtf8Bytes('m')),
        'mid-pre-upgrade',
      );
      const before = await router.getActiveInboxCount(bob.address);

      const Router = await ethers.getContractFactory('W3bMailRouter', admin);
      const upgraded = await upgrades.upgradeProxy(await router.getAddress(), Router);

      expect(await upgraded.getActiveInboxCount(bob.address)).to.equal(before);
    });
  });
});
