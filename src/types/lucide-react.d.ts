declare module 'lucide-react' {
  import * as React from 'react';
  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
    className?: string;
  }
  export type LucideIcon = React.FC<LucideProps>;

  export const Car: LucideIcon;
  export const MapPin: LucideIcon;
  export const Calendar: LucideIcon;
  export const Clock: LucideIcon;
  export const Users: LucideIcon;
  export const Search: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const XCircle: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const Play: LucideIcon;
  export const Flag: LucideIcon;
  export const Plus: LucideIcon;
  export const Shield: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const Leaf: LucideIcon;
  export const Navigation: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const Info: LucideIcon;
  export const Bell: LucideIcon;
  export const Building2: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const UserCheck: LucideIcon;
}
