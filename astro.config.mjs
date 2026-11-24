// @ts-check
import { defineConfig, mergeConfig } from 'astro/config';
import { appConfig } from './app.config.mjs';
import { triangleConfig } from './triangle.config.mjs';

export default defineConfig(mergeConfig(appConfig, triangleConfig));
