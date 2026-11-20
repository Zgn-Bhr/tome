// Generated covers (§7.9): page 1 thumbnail, or a placeholder until it's ready.

import type { CSSProperties } from 'react';
import type { Book } from '../../core/models';
import { thumbUrl } from '../../shared/api';
import { C, FONT, chakra } from '../tokens';
import { Check } from './Icons';

export function Cover({
  book,
  width,
  height,
  radius = 10,
  focused = false,
  lift = true,
  isNew = false,
  cleared = false,
  shadow = true,
  className = '',
}: {
  book: Book;
  width?: number | string;
  height: number;
  radius?: number;
  focused?: boolean;
  lift?: boolean;
  isNew?: boolean;
  cleared?: boolean;
  shadow?: boolean;
  className?: string;
}) {
  const style: CSSProperties = {
    position: 'relative',
    width: width ?? '100%',
    height,
    flex: 'none',
    borderRadius: radius,
    overflow: 'visible',
    background: C.surfaceNode,
    boxShadow: shadow && !focused ? '0 10px 24px rgba(0,0,0,0.5)' : undefined,
    opacity: book.available ? 1 : 0.4,
  };
  return (
    <div className={`focusable${lift ? ' lift' : ''}${focused ? ' is-focused' : ''} ${className}`} style={style}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden' }}>
        {book.thumbAt && book.thumbAt > 0 ? (
          <img
            src={thumbUrl(book.id, book.thumbAt)}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 14,
              textAlign: 'center',
              font: `600 14px/1.25 ${FONT.literata}`,
              color: C.textMuted,
              overflow: 'hidden',
            }}
          >
            <span className="clamp4" style={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {book.title}
            </span>
          </div>
        )}
      </div>
      {isNew && book.available ? (
        <span
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '4px 7px',
            borderRadius: 5,
            background: C.cyan,
            color: C.bgBase,
            font: chakra(700, 10),
            letterSpacing: '0.1em',
          }}
        >
          NEW
        </span>
      ) : null}
      {cleared ? (
        <span
          aria-label="Cleared"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: C.gold,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check />
        </span>
      ) : null}
      {!book.available ? (
        <span
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 8,
            padding: '5px 6px',
            borderRadius: 5,
            background: C.bgBase,
            color: C.textPrimary,
            font: chakra(700, 10),
            letterSpacing: '0.1em',
            textAlign: 'center',
          }}
        >
          NOT AVAILABLE
        </span>
      ) : null}
    </div>
  );
}
