"use client";

import { useState } from "react";
import { Camera, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { withAdminApiPath } from "@/lib/constants";
import { useAdminShell } from "@/hooks/use-admin-shell";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Button } from "@/components/ui/button";

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatar: string;
  avatarUrl?: string | null;
  lastLogin: string;
  createdAt: string;
  passwordChangedAt: string;
};

export function ProfilePage({ user }: { user: ProfileUser }) {
  const { currentUser, setCurrentUser } = useAdminShell();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      toast.error("Please upload a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error("Profile image must be smaller than 2 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("avatar", file);
    setUploadingAvatar(true);

    try {
      const response = await fetch(withAdminApiPath("/api/admin/profile/avatar"), {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { avatarUrl?: string };
        error?: { message?: string };
      };

      if (!response.ok || !payload.data?.avatarUrl) {
        throw new Error(payload.error?.message || "Unable to upload profile image.");
      }

      setAvatarUrl(payload.data.avatarUrl);
      setCurrentUser({
        ...(currentUser ?? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as NonNullable<typeof currentUser>["role"],
          status: user.status as NonNullable<typeof currentUser>["status"],
          lastActive: user.lastLogin,
          avatar: user.avatar,
          permissions: [],
        }),
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        avatarUrl: payload.data.avatarUrl,
      });
      toast.success("Profile image updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to upload profile image.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(withAdminApiPath("/api/admin/profile/password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message || "Unable to change password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[#C4862D] dark:text-[#F1C36D]">Account</div>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">My profile</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          View your admin account details and update your password securely.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex flex-col items-start gap-3">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[30px] bg-gradient-to-br from-[#E3BE2F] to-[#C4862D] text-2xl font-bold text-[#2D3138] ring-4 ring-[#F1C36D]/30">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={`${user.name} profile`} className="h-full w-full object-cover" />
                ) : (
                  user.avatar
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#E3BE2F] bg-[#FFF8DF] px-4 py-2 text-xs font-semibold text-[#2D3138] transition hover:bg-[#F1C36D]/50 focus-within:ring-4 focus-within:ring-[#E3BE2F]/25">
                <Camera className="h-4 w-4" />
                {uploadingAvatar ? "Uploading..." : "Upload image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={uploadingAvatar}
                  onChange={handleAvatarUpload}
                />
              </label>
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">{user.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{user.email}</p>
              <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {user.status}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <ProfileField icon={<UserRound className="h-4 w-4" />} label="Full name" value={user.name} />
            <ProfileField icon={<Mail className="h-4 w-4" />} label="Email" value={user.email} />
            <ProfileField icon={<ShieldCheck className="h-4 w-4" />} label="Role" value={user.role} />
            <ProfileField icon={<KeyRound className="h-4 w-4" />} label="Password changed" value={user.passwordChangedAt} />
            <ProfileField icon={<ShieldCheck className="h-4 w-4" />} label="Last login" value={user.lastLogin} />
            <ProfileField icon={<UserRound className="h-4 w-4" />} label="Account created" value={user.createdAt} />
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-950">Change password</h2>
            <p className="mt-1 text-sm text-slate-600">Use a strong password with at least 8 characters.</p>
          </div>

          <form className="space-y-4" onSubmit={handlePasswordChange}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-800">Current password</span>
              <PasswordInput
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-800">New password</span>
              <PasswordInput
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-800">Confirm new password</span>
              <PasswordInput
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Updating..." : "Update password"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="break-words text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
