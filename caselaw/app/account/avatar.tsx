// 'use client'

// export default function Avatar({
//   uid,
//   url,
//   size,
//   onUploadAction,
// }: {
//   uid: string | null
//   url: string | null
//   size: number
//   onUploadAction: (url: string) => void
// }) {
//   return (
//     <div
//       className="rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-500 text-sm"
//       style={{ width: size, height: size }}
//     >
//       {url ? (
//         // eslint-disable-next-line @next/next/no-img-element
//         <img src={url} alt="Avatar" className="rounded-full object-cover" style={{ width: size, height: size }} />
//       ) : (
//         <span>No image</span>
//       )}
//     </div>
//   )
// }
