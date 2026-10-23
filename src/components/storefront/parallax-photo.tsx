"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { cn } from "cn";
import { storefrontImageUrl } from "./image-url";

/**
 * A photo that drifts a little slower than the page (±8 % of its height while its band crosses
 * the viewport). The image is 20 % taller than its frame so the drift never shows an edge. The
 * drift is a scroll-linked transform; under reduced motion a media query pins it, so the server
 * HTML and the first client render never disagree.
 */
export function ParallaxPhoto({ slug, imageId, alt, sizes = "100vw", className }: { slug: string; imageId: string; alt: string; sizes?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);

  return (
    <div ref={ref} className={cn("overflow-hidden", className)}>
      <motion.div style={{ y }} className="absolute inset-x-0 -inset-y-[10%] will-change-transform motion-reduce:transform-none!">
        <Image src={storefrontImageUrl(slug, imageId)} alt={alt} fill sizes={sizes} className="object-cover" />
      </motion.div>
    </div>
  );
}
