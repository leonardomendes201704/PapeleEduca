import { Editor } from 'https://esm.sh/@tiptap/core@2.11.5';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.11.5';
import Image from 'https://esm.sh/@tiptap/extension-image@2.11.5';
import Link from 'https://esm.sh/@tiptap/extension-link@2.11.5';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.11.5';

let editor = null;

export function getBlogEditor() {
  return editor;
}

export function getEditorHtml() {
  return editor?.getHTML() || '';
}

export function getEditorJson() {
  return editor?.getJSON() || null;
}

export function setEditorContent(html = '') {
  if (!editor) return;
  editor.commands.setContent(html || '<p></p>', false);
}

export function destroyBlogEditor() {
  editor?.destroy();
  editor = null;
}

export async function initBlogEditor({ element, onImageRequest }) {
  if (!element) return null;
  if (editor) {
    destroyBlogEditor();
  }

  editor = new Editor({
    element,
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Placeholder.configure({ placeholder: 'Escreva ou cole o conteúdo do post…' }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'blog-tiptap-content',
      },
      handlePaste(view, event) {
        // Allow default TipTap paste (keeps basic formatting from Word/Docs)
        return false;
      },
    },
  });

  const toolbar = document.getElementById('blog-editor-toolbar');
  toolbar?.querySelectorAll('button[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!editor) return;
      const cmd = btn.dataset.cmd;
      if (cmd === 'bold') editor.chain().focus().toggleBold().run();
      if (cmd === 'italic') editor.chain().focus().toggleItalic().run();
      if (cmd === 'heading') editor.chain().focus().toggleHeading({ level: Number(btn.dataset.level || 2) }).run();
      if (cmd === 'bulletList') editor.chain().focus().toggleBulletList().run();
      if (cmd === 'orderedList') editor.chain().focus().toggleOrderedList().run();
      if (cmd === 'blockquote') editor.chain().focus().toggleBlockquote().run();
      if (cmd === 'undo') editor.chain().focus().undo().run();
      if (cmd === 'redo') editor.chain().focus().redo().run();
      if (cmd === 'link') {
        const prev = editor.getAttributes('link').href || '';
        const url = window.prompt('URL do link', prev);
        if (url === null) return;
        if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
        else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      }
      if (cmd === 'image' && typeof onImageRequest === 'function') {
        await onImageRequest();
      }
    });
  });

  return editor;
}

export function insertEditorImage(url, alt = '') {
  if (!editor || !url) return;
  editor.chain().focus().setImage({ src: url, alt }).run();
}
