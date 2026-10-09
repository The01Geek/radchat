import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useRenderContext } from './context';

interface SafeLinkProps {
  href?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Anchor for links inside answers. Opens in a new tab with `noopener noreferrer`
 * unless the host's `onLinkClick` calls `preventDefault()`. react-markdown has
 * already removed unsafe URL schemes (e.g. `javascript:`) before this renders.
 */
export function SafeLink({ href, children, className, style }: SafeLinkProps) {
  const { onLinkClick } = useRenderContext();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onLinkClick || !href) return;
    let prevented = false;
    onLinkClick({
      href,
      preventDefault: () => {
        prevented = true;
      },
    });
    if (prevented) event.preventDefault();
  };

  return (
    <a
      href={href}
      className={className}
      style={style}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
