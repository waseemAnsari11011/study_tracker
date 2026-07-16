"use client";

import FileHandler from "@tiptap/extension-file-handler";
import TiptapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from "lucide-react";
import { EditorDocument } from "../lib/study-data";

export type PreparedEditorImage = {
  id: string;
  previewUrl: string;
};

type RichNoteEditorProps = {
  content: EditorDocument;
  placeholder: string;
  onChange: (content: EditorDocument) => void;
  onPrepareImage: (file: File) => Promise<PreparedEditorImage | null>;
};

const EditorImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentId: { default: null },
      pendingId: { default: null },
      publicId: { default: null },
    };
  },
}).configure({
  inline: false,
  allowBase64: false,
  resize: {
    enabled: true,
    directions: [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "left",
      "right",
    ],
    minWidth: 120,
    minHeight: 80,
    alwaysPreserveAspectRatio: true,
  },
  HTMLAttributes: { class: "rich-editor-image" },
});

export function RichNoteEditor({
  content,
  placeholder,
  onChange,
  onPrepareImage,
}: RichNoteEditorProps) {
  async function insertFiles(
    editor: NonNullable<ReturnType<typeof useEditor>>,
    files: File[],
    position?: number,
  ) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    let insertAt = position;
    for (const file of images) {
      const prepared = await onPrepareImage(file);
      if (!prepared) continue;
      const nodes = [
        {
          type: "image",
          attrs: {
            src: prepared.previewUrl,
            alt: file.name,
            title: file.name,
            pendingId: prepared.id,
          },
        },
        { type: "paragraph" },
      ];
      if (editor.isEmpty) {
        editor.commands.setContent(nodes);
        editor.commands.focus("end");
        insertAt = undefined;
        continue;
      }
      if (typeof insertAt === "number") {
        editor.chain().focus().insertContentAt(insertAt, nodes).run();
        insertAt += 2;
      } else {
        editor.chain().focus().insertContent(nodes).run();
      }
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      EditorImage,
      Placeholder.configure({ placeholder }),
      FileHandler.configure({
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        consumePasteEvent: true,
        onPaste: (currentEditor, files) => {
          void insertFiles(currentEditor, files);
        },
        onDrop: (currentEditor, files, position) => {
          void insertFiles(currentEditor, files, position);
        },
      }),
    ],
    content,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON() as EditorDocument);
    },
  });

  if (!editor) return <div className="rich-editor-loading">Loading editor...</div>;

  return (
    <div className="tiptap-editor">
      <div className="tiptap-toolbar" aria-label="Text formatting tools">
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          aria-label="Bold"
          title="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={17} />
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          aria-label="Italic"
          title="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={17} />
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "active" : ""}
          aria-label="Bullet list"
          title="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={17} />
        </button>
        <button
          type="button"
          className={editor.isActive("orderedList") ? "active" : ""}
          aria-label="Numbered list"
          title="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={17} />
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={17} />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={17} />
        </button>
        <label className="editor-image-button" title="Insert image">
          <ImagePlus size={17} />
          <span>Image</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              if (event.target.files) void insertFiles(editor, Array.from(event.target.files));
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <EditorContent editor={editor} />
      <div className="tiptap-editor-hint">Paste or drop images at the cursor</div>
    </div>
  );
}
