"use client";

import { useRef, useState, type DragEvent, type ChangeEvent, type ClipboardEvent } from "react";

const acceptedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

const maxImageSize = 4 * 1024 * 1024;

export type AttachedImage = {
  dataUrl: string;
  name: string;
};

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Nie udalo sie odczytac obrazu."));
    reader.readAsDataURL(file);
  });
}

export function useImageAttachment() {
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [imageError, setImageError] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function attachFile(file: File | null | undefined) {
    if (!file) {
      return;
    }

    if (!acceptedTypes.has(file.type)) {
      setImageError("Akceptuje tylko PNG, JPG, JPEG, GIF albo WEBP.");
      return;
    }

    if (file.size > maxImageSize) {
      setImageError("Max 4MB. Zrob screenshot fragmentu.");
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      setAttachedImage({ dataUrl, name: file.name || "Screenshot" });
      setImageError("");
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "Nie udalo sie odczytac obrazu.",
      );
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const item = Array.from(event.clipboardData.items).find((entry) =>
      entry.type.startsWith("image/"),
    );

    if (!item) {
      return;
    }

    event.preventDefault();
    void attachFile(item.getAsFile());
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void attachFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave() {
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragActive(false);
    void attachFile(event.dataTransfer.files?.[0]);
  }

  return {
    attachedImage,
    imageError,
    isDragActive,
    fileInputRef,
    attachFile,
    clearImage: () => setAttachedImage(null),
    handlePaste,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    openFilePicker: () => fileInputRef.current?.click(),
    setImageError,
  };
}
