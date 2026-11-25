import type { NextConfig } from 'next';
const config: NextConfig = process.env.TRIPTRACK_TEST_DATA ? { distDir: '.next-test' } : {};
export default config;

