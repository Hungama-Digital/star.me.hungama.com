// src/starme/data/manifest.ts
// Loads assets/shells/shells_manifest.json (the single source of truth for shells,
// roles, episodes and packages) and exposes the ShellManifest.kt helpers.
import manifestJson from '../assets/shells/shells_manifest.json';

export interface PackageDef {
  id: string;
  name: string;
  episodes: number;
  credits: number;
  desc: string;
  highlight?: boolean;
}

export interface RoleDef {
  id: string;
  name: string;
  desc: string;
}

export interface EpisodeDef {
  n: number;
  title: string;
  file: string | null;
  durationSec?: number;
  placeholder?: boolean;
}

export interface ShellPalette {
  c1: string;
  c2: string;
  accent: string;
}

export interface ShellDef {
  id: string;
  title: string;
  kicker: string;
  palette?: ShellPalette;
  status?: string; // 'live' | 'soon'
  roles?: RoleDef[];
  episodes?: EpisodeDef[];
}

export interface ShellManifest {
  manifestVersion: number;
  brand: string;
  welcomeCredits: number;
  packages: PackageDef[];
  shells: ShellDef[];
}

export const manifest = manifestJson as ShellManifest;
export const welcomeCredits = manifest.welcomeCredits;

// Derived helpers, matching ShellManifest.kt.
export const isLive = (s: ShellDef) => s.status?.toLowerCase() === 'live';
export const liveShells = (m: ShellManifest = manifest) => m.shells.filter(isLive);
export const shell = (id?: string | null, m: ShellManifest = manifest) =>
  m.shells.find((s) => s.id === id) ?? null;
export const pkg = (id?: string | null, m: ShellManifest = manifest) =>
  m.packages.find((p) => p.id === id) ?? null;
export const hasContent = (e: EpisodeDef) => !!e.file && e.file.length > 0;
