import type { NextConfig } from 'next';
const githubPages = process.env.GITHUB_PAGES === '1';
const nextConfig:NextConfig={
  output:'export',
  assetPrefix:githubPages?'/timetable-mvp/':undefined,
  trailingSlash:true,
};
export default nextConfig;
