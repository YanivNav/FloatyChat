import React, { type FC } from 'react';
import type { ProductCard } from '../types';
import styles from '../chat-widget.module.scss';

interface Props {
  products: ProductCard[];
  primaryColor: string;
  onAddToCart: (p: ProductCard) => void;
  onNavigate: (slug: string) => void;
}

export const ProductCarousel: FC<Props> = ({ products, primaryColor, onAddToCart, onNavigate }) => (
  <div className={styles.productCarousel}>
    {products.map((p) => (
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
          <div className={styles.productName} onClick={() => onNavigate(p.slug)}>
            {p.name}
          </div>
          {p.price && <div className={styles.productPrice}>{p.price}</div>}
          <button
            className={styles.productAddBtn}
            style={{ background: primaryColor }}
            onClick={() => onAddToCart(p)}
          >
            Add to cart
          </button>
        </div>
      </div>
    ))}
  </div>
);
