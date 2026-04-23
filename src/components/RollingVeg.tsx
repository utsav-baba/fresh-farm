import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

const VEGETABLES = [
  { emoji: '🥕', top: '15%', side: 'left', size: 28 },
  { emoji: '🌽', top: '38%', side: 'left', size: 24 },
  { emoji: '🍅', top: '62%', side: 'left', size: 26 },
  { emoji: '🧅', top: '22%', side: 'right', size: 26 },
  { emoji: '🥦', top: '48%', side: 'right', size: 22 },
  { emoji: '🫑', top: '72%', side: 'right', size: 25 },
];

export function RollingVeg() {
  const { scrollY } = useScroll();
  const rotate = useTransform(scrollY, [0, 1000], [0, 1800]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {VEGETABLES.map((veg, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            top: veg.top,
            [veg.side === 'left' ? 'left' : 'right']: '-6px',
            fontSize: veg.size,
            rotate: veg.side === 'left' ? rotate : useTransform(rotate, (v) => -v),
            filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.25))',
          }}
          animate={{
            y: [0, -10, 0],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          {veg.emoji}
        </motion.div>
      ))}
    </div>
  );
}
