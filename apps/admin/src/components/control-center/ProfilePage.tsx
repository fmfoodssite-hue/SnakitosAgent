"use client";

import { useState } from "react";
import { KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { withAdminApiPath } from "@/lib/constants";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Button } from "@/components/ui/button";

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatar: string;
  lastLogin: string;
  createdAt: string;
  passwordChangedAt: string;
};

export function ProfilePage({ user }: { user: ProfileUser }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">Account</div>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">My profile</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          View your admin account details and update your password securely.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-indigo-600 to-violet-500 text-2xl font-bold text-white">
              {user.avatar}
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
