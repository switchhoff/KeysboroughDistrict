/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',   // generates /out for Firebase Hosting
  trailingSlash: true, // required for static export with dynamic routes
  images: { unoptimized: true }, // Next/Image doesn't work in static export
}

export default nextConfig
