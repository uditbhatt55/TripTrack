import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

export default function config(phase: string): NextConfig {
  if (process.env.TRIPTRACK_TEST_DATA) return { distDir: '.next-test' };
  if (phase === PHASE_DEVELOPMENT_SERVER) return { distDir: '.next-local' };
  return {};
}

