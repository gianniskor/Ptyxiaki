"use client";

import Link from "next/link";
import { Icon } from "@iconify/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface UserDropdownProps {
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  isOrgAdmin?: boolean;
  onSignOut: () => void;
}

function getInitials(displayName: string | null | undefined, email: string): string {
  if (displayName) {
    const parts = displayName.trim().split(" ").filter((p) => p.length > 0);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0][0].toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
}

export function UserDropdown({ email, displayName, avatarUrl, isAdmin, isOrgAdmin, onSignOut }: UserDropdownProps) {
  const initials = getInitials(displayName, email);
  const name = displayName || email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
          aria-label="Open user menu"
        >
          <Avatar className="cursor-pointer size-9 border border-gray-700 hover:border-gray-500 transition">
            <AvatarImage src={avatarUrl ?? undefined} alt={name} />
            <AvatarFallback className="bg-[#1e1e22] text-gray-200 text-sm font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={cn(
          "w-[260px] rounded-2xl border border-gray-700 bg-[#151518] p-1 shadow-2xl",
          // override default popover vars
          "[--popover:theme(colors.transparent)] [--popover-foreground:theme(colors.gray.100)]",
        )}
      >
        {/* User header */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Avatar className="size-9 border border-gray-700 shrink-0">
            <AvatarImage src={avatarUrl ?? undefined} alt={name} />
            <AvatarFallback className="bg-[#1e1e22] text-gray-200 text-sm font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-100 truncate">{displayName || "—"}</p>
            <p className="text-xs text-gray-500 truncate">{email}</p>
          </div>
        </div>

        <DropdownMenuSeparator className="bg-gray-800" />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="rounded-lg cursor-pointer px-3 py-2 focus:bg-white/5 text-gray-300 hover:text-gray-100">
            <Link href="/account" className="flex items-center gap-2.5">
              <Icon icon="solar:user-circle-line-duotone" className="size-4 text-gray-500 shrink-0" />
              <span className="text-sm">Ο λογαριασμός μου</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-lg cursor-pointer px-3 py-2 focus:bg-white/5 text-gray-300 hover:text-gray-100">
            <Link href="/settings" className="flex items-center gap-2.5">
              <Icon icon="solar:settings-line-duotone" className="size-4 text-gray-500 shrink-0" />
              <span className="text-sm">Ρυθμίσεις</span>
            </Link>
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem asChild className="rounded-lg cursor-pointer px-3 py-2 focus:bg-yellow-500/10 text-yellow-400 hover:text-yellow-300">
              <Link href="/admin" className="flex items-center gap-2.5">
                <Icon icon="solar:shield-bold-duotone" className="size-4 shrink-0" />
                <span className="text-sm font-medium">Admin Panel</span>
              </Link>
            </DropdownMenuItem>
          )}
          {isOrgAdmin && !isAdmin && (
            <DropdownMenuItem asChild className="rounded-lg cursor-pointer px-3 py-2 focus:bg-sky-500/10 text-sky-400 hover:text-sky-300">
              <Link href="/org" className="flex items-center gap-2.5">
                <Icon icon="solar:buildings-2-bold-duotone" className="size-4 shrink-0" />
                <span className="text-sm font-medium">Ο οργανισμός μου</span>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="bg-gray-800" />

        <DropdownMenuGroup>
          <DropdownMenuItem
            className="rounded-lg cursor-pointer px-3 py-2 focus:bg-white/5 text-gray-400 hover:text-red-400"
            onClick={onSignOut}
          >
            <span className="flex items-center gap-2.5">
              <Icon icon="solar:logout-2-bold-duotone" className="size-4 shrink-0" />
              <span className="text-sm">Αποσύνδεση</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserDropdown;
