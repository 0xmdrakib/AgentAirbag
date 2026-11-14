import type { ComponentProps } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  CodeXml,
  Copy,
  Download,
  ExternalLink,
  LogOut,
  type LucideIcon,
  Menu,
  Pause,
  Play,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Tag,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';

/**
 * The app uses one icon family: Lucide (MIT, 24px grid, consistent stroke).
 * These wrappers keep the existing export names so call sites do not change.
 */
function fromLucide(Icon: LucideIcon) {
  return function IconComponent({ size = 18, strokeWidth = 1.75, ...props }: ComponentProps<LucideIcon>) {
    return <Icon size={size} strokeWidth={strokeWidth} aria-hidden {...props} />;
  };
}

export const WalletIcon = fromLucide(Wallet);
export const BookmarkIcon = fromLucide(Bookmark);
export const LogOutIcon = fromLucide(LogOut);
export const CheckIcon = fromLucide(Check);
export const XIcon = fromLucide(X);
export const AlertIcon = fromLucide(TriangleAlert);
export const PlayIcon = fromLucide(Play);
export const PauseIcon = fromLucide(Pause);
export const ArrowRightIcon = fromLucide(ArrowRight);
export const ArrowUpIcon = fromLucide(ArrowUp);
export const CopyIcon = fromLucide(Copy);
export const DownloadIcon = fromLucide(Download);
export const ShareIcon = fromLucide(Share2);
export const SearchIcon = fromLucide(Search);
export const ChevronIcon = fromLucide(ChevronDown);
export const TerminalIcon = fromLucide(SquareTerminal);
export const ShieldIcon = fromLucide(ShieldCheck);
export const ClockIcon = fromLucide(Clock);
export const TagIcon = fromLucide(Tag);
export const CodeIcon = fromLucide(CodeXml);
export const ExternalIcon = fromLucide(ExternalLink);
export const MenuIcon = fromLucide(Menu);
export const SparkIcon = fromLucide(Sparkles);
