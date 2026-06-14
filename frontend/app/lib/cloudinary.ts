import { v2 as cloudinary, type UploadApiOptions } from "cloudinary";

/**
 * Cloudinary upload helpers. We used to write PDFs and chat photos to
 * `public/uploads` / `public/manuals` on local disk, which does not survive a
 * serverless / read-only-filesystem deploy. Everything now goes to Cloudinary
 * and we persist the returned `secure_url`.
 *
 * Creds come from `frontend/.env`:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *   CLOUDINARY_FOLDER (optional, default "moss")
 */

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const FOLDER = process.env.CLOUDINARY_FOLDER || "moss";

let configured = false;

/** True when all three Cloudinary credentials are present. */
export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

function ensureConfigured() {
  if (!cloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, " +
        "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in frontend/.env",
    );
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: CLOUD_NAME,
      api_key: API_KEY,
      api_secret: API_SECRET,
      secure: true,
    });
    configured = true;
  }
}

/** Upload raw bytes to Cloudinary and resolve with the public delivery URL. */
function upload(
  bytes: Uint8Array,
  options: UploadApiOptions,
): Promise<{ url: string; publicId: string }> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: FOLDER, use_filename: false, unique_filename: false, overwrite: true, ...options },
      (err, result) => {
        if (err || !result) {
          reject(err ?? new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(Buffer.from(bytes));
  });
}

/**
 * Upload PDF bytes. Stored as `resource_type: "raw"` so the original bytes are
 * delivered verbatim (and re-fetchable for reindexing) without needing the
 * account-level "allow delivery of PDF files" toggle. `publicId` should include
 * the `.pdf` extension so the delivery URL ends in `.pdf`.
 */
export function uploadPdfToCloudinary(bytes: Uint8Array, publicId: string) {
  return upload(bytes, { resource_type: "raw", public_id: publicId });
}

/** Upload an image (chat troubleshooting photo). */
export function uploadImageToCloudinary(bytes: Uint8Array, publicId: string) {
  return upload(bytes, { resource_type: "image", public_id: publicId });
}
