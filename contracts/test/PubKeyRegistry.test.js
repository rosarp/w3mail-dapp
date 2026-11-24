const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('PubKeyRegistry', () => {
  let registry, alice, bob;

  beforeEach(async () => {
    [alice, bob] = await ethers.getSigners();
    const F = await ethers.getContractFactory('PubKeyRegistry');
    registry = await F.deploy();
    await registry.waitForDeployment();
  });

  it('register + fetch + hasPubKey', async () => {
    expect(await registry.hasPubKey(alice.address)).to.equal(false);

    const key = ethers.randomBytes(32);
    await expect(registry.connect(alice).registerPubKey(key))
      .to.emit(registry, 'PubKeyRegistered')
      .withArgs(alice.address);

    expect(await registry.hasPubKey(alice.address)).to.equal(true);
    expect(await registry.fetchPubKey(alice.address)).to.equal(ethers.hexlify(key));
  });

  it('update emits PubKeyUpdated, not Registered', async () => {
    await registry.connect(alice).registerPubKey(ethers.randomBytes(32));
    const newKey = ethers.randomBytes(32);
    await expect(registry.connect(alice).registerPubKey(newKey))
      .to.emit(registry, 'PubKeyUpdated')
      .withArgs(alice.address);
    expect(await registry.fetchPubKey(alice.address)).to.equal(ethers.hexlify(newKey));
  });

  it('rejects empty + oversized keys', async () => {
    await expect(registry.connect(alice).registerPubKey('0x')).to.be.revertedWith('Empty public key');
    await expect(registry.connect(alice).registerPubKey(ethers.randomBytes(65))).to.be.revertedWith('PubKey too large');
  });

  it('fetchPubKey reverts when no key registered', async () => {
    await expect(registry.fetchPubKey(bob.address)).to.be.revertedWith('No public key registered');
  });
});
