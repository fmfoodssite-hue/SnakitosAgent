import { randomUUID } from "node:crypto";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

const AVATAR_BUCKET = "admin-avatars";
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getExtension(file: File) {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  if (nameExtension && ["jpg", "jpeg", "png", "webp"].includes(nameExtension)) {
    return nameExtension === "jpg" ? "jpeg" : nameExtension;
  }

  switch (file.type) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpeg";
  }
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async ({ admin, ipAddress }) => {
    try {
      const formData = await request.formData();
      const file = formData.get("avatar");

      if (!(file instanceof File)) {
        return errorResponse("VALIDATION_FAILED", "Profile image is required.", 400);
      }

      if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
        return errorResponse("VALIDATION_FAILED", "Only JPG, PNG, and WEBP images are supported.", 400);
      }

      if (file.size <= 0 || file.size > MAX_AVATAR_SIZE_BYTES) {
        return errorResponse("VALIDATION_FAILED", "Profile image must be smaller than 2 MB.", 400);
      }

      const supabase = assertServiceClient();
      const { data: currentAdmin, error: currentAdminError } = await supabase
        .from("admins")
        .select("id, avatar_path")
        .eq("id", admin.id)
        .single();

      if (currentAdminError || !currentAdmin) {
        return errorResponse("PROFILE_NOT_FOUND", "Unable to load current user.", 404);
      }

      const extension = getExtension(file);
      const storagePath = `${admin.id}/${Date.now()}-${randomUUID()}.${extension}`;
      const buffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
      const avatarUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("admins")
        .update({
          avatar_url: avatarUrl,
          avatar_path: storagePath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", admin.id);

      if (updateError) {
        await supabase.storage.from(AVATAR_BUCKET).remove([storagePath]);
        throw updateError;
      }

      if (currentAdmin.avatar_path) {
        await supabase.storage.from(AVATAR_BUCKET).remove([currentAdmin.avatar_path]).catch(() => undefined);
      }

      await safeAudit({
        adminId: admin.id,
        action: "profile.avatar_update",
        entityType: "admin",
        entityId: admin.id,
        details: { storagePath },
        ipAddress,
      });

      return successResponse({ avatarUrl, avatarPath: storagePath });
    } catch (error) {
      console.error("Profile image upload failed", error);
      return errorResponse("PROFILE_IMAGE_UPLOAD_FAILED", "Unable to upload profile image.", 500);
    }
  });
}
