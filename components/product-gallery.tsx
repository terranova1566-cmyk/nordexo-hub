"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  Image,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useMemo, useState } from "react";
import type { ImageAsset } from "@/lib/product-media";

export const GALLERY_THUMB_SIZE = 100;
export const GALLERY_THUMB_GAP = 12;
export const GALLERY_WIDTH = GALLERY_THUMB_SIZE * 5 + GALLERY_THUMB_GAP * 4;
const GALLERY_WIDTH_PX = `${GALLERY_WIDTH}px`;

const useStyles = makeStyles({
  gallery: {
    display: "grid",
    gap: "16px",
    width: GALLERY_WIDTH_PX,
    minWidth: GALLERY_WIDTH_PX,
    boxSizing: "border-box",
  },
  main: {
    borderRadius: "16px",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    padding: 0,
    minWidth: "unset",
    boxSizing: "border-box",
  },
  mainImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  thumbRow: {
    display: "grid",
    gridTemplateColumns: `repeat(5, ${GALLERY_THUMB_SIZE}px)`,
    gap: `${GALLERY_THUMB_GAP}px`,
    width: GALLERY_WIDTH_PX,
    justifyContent: "start",
  },
  thumbButton: {
    padding: 0,
    width: `${GALLERY_THUMB_SIZE}px`,
    height: `${GALLERY_THUMB_SIZE}px`,
    minWidth: "unset",
    borderRadius: "12px",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxSizing: "border-box",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForeground3,
  },
  lightboxImage: {
    width: "100%",
    maxHeight: "80vh",
    objectFit: "contain",
  },
});

export default function ProductGallery({
  images,
  thumbnails,
  originals,
}: {
  images: ImageAsset[];
  thumbnails?: ImageAsset[];
  originals?: ImageAsset[];
}) {
  const styles = useStyles();
  const [selected, setSelected] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const activeImage = useMemo(() => images[selected], [images, selected]);
  const fullImage = useMemo(
    () => originals?.[selected] ?? activeImage,
    [activeImage, originals, selected]
  );
  const thumbItems = useMemo(() => {
    if (thumbnails && thumbnails.length) return thumbnails;
    return images;
  }, [images, thumbnails]);
  const visibleThumbs = useMemo(() => {
    const count = Math.min(images.length, thumbItems.length);
    return thumbItems.slice(0, count);
  }, [images.length, thumbItems]);

  if (!images.length) {
    return (
      <div className={styles.main}>
        <div className={styles.placeholder}>
          <Text>No images available</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.gallery}>
      <Button
        appearance="subtle"
        className={styles.main}
        onClick={() => setIsOpen(true)}
      >
        <Image
          src={activeImage.src}
          alt={activeImage.alt}
          className={styles.mainImage}
        />
      </Button>

      <div className={styles.thumbRow}>
        {visibleThumbs.map((image, index) => (
          <Button
            key={`${image.src}-${index}`}
            appearance={index === selected ? "primary" : "subtle"}
            className={styles.thumbButton}
            onClick={() => setSelected(index)}
          >
            <Image src={image.src} alt={image.alt} className={styles.thumbImage} />
          </Button>
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={(_, data) => setIsOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogContent>
              <Image
                src={fullImage.src}
                alt={fullImage.alt}
                className={styles.lightboxImage}
              />
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
