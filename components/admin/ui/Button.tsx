'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/* cam2rent Admin 2.0 — Button-Primitive
   Klare Hierarchie (kein Farbzoo): primär = cyan, sekundär = weiß/Rahmen,
   destruktiv = dezent rosa, warn = amber sparsam. */

type Variant = 'primary' | 'secondary' | 'destructive' | 'warning' | 'ghost';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-cyan-500 text-white hover:bg-cyan-600 border border-transparent',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:border-cyan-400 hover:text-cyan-700',
  destructive:
    'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 border border-transparent',
  ghost: 'bg-transparent text-slate-500 hover:text-slate-900 border border-transparent',
};

const SIZE: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[12px] gap-1.5',
  md: 'px-3 py-2 text-[13px] gap-1.5',
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  children?: ReactNode;
  className?: string;
  fullWidth?: boolean;
};

function classes({ variant = 'secondary', size = 'md', fullWidth, className = '' }: CommonProps) {
  return [
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed',
    VARIANT[variant],
    SIZE[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button(
  props: CommonProps & {
    onClick?: () => void;
    type?: 'button' | 'submit';
    disabled?: boolean;
    title?: string;
  },
) {
  const { icon: Icon, iconRight: IconRight, children, onClick, type = 'button', disabled, title } = props;
  const iconSize = props.size === 'sm' ? 13 : 15;
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={classes(props)}>
      {Icon && <Icon size={iconSize} />}
      {children}
      {IconRight && <IconRight size={iconSize} />}
    </button>
  );
}

export function ButtonLink(props: CommonProps & { href: string; target?: string }) {
  const { icon: Icon, iconRight: IconRight, children, href, target } = props;
  const iconSize = props.size === 'sm' ? 13 : 15;
  return (
    <Link href={href} target={target} className={classes(props)}>
      {Icon && <Icon size={iconSize} />}
      {children}
      {IconRight && <IconRight size={iconSize} />}
    </Link>
  );
}
