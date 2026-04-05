import React, { type FC, useRef, useState, useCallback } from 'react';
import type { ProductCard } from '../types';
import styles from '../chat-widget.module.scss';

interface Props {
  products: ProductCard[];
  primaryColor: string;
  onAddToCart: (p: ProductCard) => Promise<void>;
  onNavigate: (slug: string) => void;
}

export const ProductCarousel: FC<Props> = ({ products, primaryColor, onAddToCart, onNavigate }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  const scroll = useCallback((dir: 1 | -1) => {
    trackRef.current?.scrollBy({ left: dir * 126, behavior: 'smooth' });
  }, []);

  const handleAddToCart = useCallback(async (p: ProductCard) => {
    setAddedId(p.id);
    await onAddToCart(p);
    setTimeout(() => setAddedId((cur) => cur === p.id ? null : cur), 1500);
  }, [onAddToCart]);

  return (
    <div className={styles.productCarouselWrapper}>
      {products.length > 2 && (
        <button className={styles.carouselArrow} style={{ left: 0 }} onClick={() => scroll(-1)} aria-label="Scroll left">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <div className={styles.productCarousel} ref={trackRef}>
        {products.map((p) => {
          const added = addedId === p.id;
          return (
            <div key={p.id} className={styles.productCard}>
              <div className={styles.productImage} onClick={() => onNavigate(p.slug)}>
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className={styles.productImagePlaceholder}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <rect width="24" height="24" rx="4" fill="#E0E0E0" />
                      <path d="M4 16l4-4 3 3 4-5 5 6H4z" fill="#B0B0B0" />
                    </svg>
                  </div>
                )}
              </div>
              <div className={styles.productInfo}>
                <div className={styles.productName} onClick={() => onNavigate(p.slug)}>{p.name}</div>
                {p.price && <div className={styles.productPrice}>{p.price}</div>}
                <button
                  className={styles.productAddBtn}
                  style={{ background: added ? '#22a06b' : primaryColor, transition: 'background 0.2s' }}
                  onClick={() => handleAddToCart(p)}
                  disabled={added}
                >
                  {added ? 'Added!' : 'Add to cart'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {products.length > 2 && (
        <button className={styles.carouselArrow} style={{ right: 0 }} onClick={() => scroll(1)} aria-label="Scroll right">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
};
