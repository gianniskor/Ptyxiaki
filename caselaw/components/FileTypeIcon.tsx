"use client";

import React from 'react';
import {
  TbFileTypeDoc,
  TbFileTypeDocx,
  TbFileTypePdf,
  TbFileTypeXml,
  TbFileTypeXls,
  TbFileTypeCsv,
} from 'react-icons/tb';
import { FileText } from 'lucide-react';

type FileTypeStyle = {
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Foreground color (icon). */
  color: string;
};

/**
 * Map of supported file extensions to their icon component and accent color.
 * Excel (xls/xlsx) and CSV are not present in the current dataset but are
 * included for future use.
 */
const FILE_TYPE_MAP: Record<string, FileTypeStyle> = {
  doc:  { Icon: TbFileTypeDoc,  color: 'oklch(70.7% 0.165 254.624)' }, // blue
  docx: { Icon: TbFileTypeDocx, color: 'oklch(54.6% 0.245 262.881)' }, // blue
  pdf:  { Icon: TbFileTypePdf,  color: 'oklch(57.7% 0.245 27.325)' },  // red
  xml:  { Icon: TbFileTypeXml,  color: 'oklch(64.6% 0.222 41.116)' },  // orange
  xls:  { Icon: TbFileTypeXls,  color: 'oklch(62.7% 0.194 149.214)' }, // green
  xlsx: { Icon: TbFileTypeXls,  color: 'oklch(62.7% 0.194 149.214)' }, // green
  csv:  { Icon: TbFileTypeCsv,  color: 'oklch(68.1% 0.162 75.834)' },  // yellow
};

const DEFAULT_STYLE: FileTypeStyle = {
  Icon: FileText as FileTypeStyle['Icon'],
  color: 'oklch(79.5% 0.184 86.047)', // fallback yellow
};

/** Extract the lowercase extension from a file name or path. */
export function getFileExtension(name?: string): string {
  if (!name) return '';
  const clean = name.split(/[?#]/)[0].split(/[\\/]/).pop() ?? '';
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

/** Resolve the icon + color style for a given file name/path. */
export function getFileTypeStyle(name?: string): FileTypeStyle {
  return FILE_TYPE_MAP[getFileExtension(name)] ?? DEFAULT_STYLE;
}

/** Remove a trailing known file extension from a display name. */
export function stripFileExtension(name?: string): string {
  if (!name) return '';
  return name.replace(/\.(pdf|docx?|xlsx?|csv|xml)$/i, '');
}

/**
 * Renders a file-type icon inside a tinted, rounded box. The icon and the box
 * tint are derived from the file extension of `fileName`.
 */
export function FileTypeIcon({
  fileName,
  className = 'w-4 h-4',
  boxClassName = 'p-1.5 rounded-lg shrink-0',
}: {
  fileName?: string;
  className?: string;
  boxClassName?: string;
}) {
  const { Icon, color } = getFileTypeStyle(fileName);
  return (
    <div
      className={boxClassName}
      style={{ backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)` }}
    >
      <Icon className={className} style={{ color }} />
    </div>
  );
}
