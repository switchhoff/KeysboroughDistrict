/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  distDir: '../out-fans',  // builds into KPP/out-fans/ alongside KPP/out/
}

export default nextConfig
