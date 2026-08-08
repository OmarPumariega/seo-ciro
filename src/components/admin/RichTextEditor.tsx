"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import * as Popover from "@radix-ui/react-popover";
import { Bold, Italic, Underline as UnderlineIcon, Palette, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

// Editor de texto enriquecido minimalista (negrita/cursiva/subrayado/color),
// usado por el módulo Notas. Genérico y sin dependencias del dominio de
// Notas a propósito, para poder reutilizarse si otro módulo lo necesita más
// adelante. El HTML que produce viene siempre del schema cerrado de Tiptap
// (sin <script>/<iframe>/atributos on*), así que renderizarlo luego con
// dangerouslySetInnerHTML es seguro.

const COLOR_SWATCHES = [
  { label: "Rojo", value: "#dc2626" },
  { label: "Naranja", value: "#ea580c" },
  { label: "Ámbar", value: "#ca8a04" },
  { label: "Verde", value: "#16a34a" },
  { label: "Azul", value: "#2563eb" },
  { label: "Morado", value: "#9333ea" },
];

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-gray-900 text-white hover:bg-gray-800 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "tiptap min-h-[84px] px-3 py-2 text-sm outline-none",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // Tope de longitud aproximado: cortar por caracteres de HTML (no de
      // texto visible) es tosco, pero evita notas que crezcan sin límite;
      // la validación real y definitiva vuelve a ocurrir en la API.
      if (maxLength && html.length > maxLength) return;
      onChange(html);
    },
  });

  // `content` en useEditor solo fija el estado inicial: si el valor cambia
  // desde fuera (reset tras guardar, "Cancelar" restaurando el original...)
  // hay que empujarlo al editor a mano, o se queda desincronizado. emitUpdate:
  // false evita que esto dispare a su vez onUpdate y entre en bucle.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className={cn("border border-gray-200 rounded-lg", className)}>
        <div className="min-h-[84px] px-3 py-2" />
      </div>
    );
  }

  return (
    <div className={cn("border border-gray-200 rounded-lg focus-within:border-gray-400", className)}>
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-100">
        <ToolbarButton
          title="Negrita"
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Cursiva"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Subrayado"
          active={editor.isActive("underline")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="w-px h-4 bg-gray-200 mx-1" />

        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              title="Color de texto"
              disabled={disabled}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
            >
              <Palette className="h-3.5 w-3.5" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex items-center gap-1.5"
            >
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => editor.chain().focus().setColor(c.value).run()}
                  className="h-5 w-5 rounded-full border border-black/10"
                  style={{ backgroundColor: c.value }}
                />
              ))}
              <label
                title="Color personalizado"
                className="h-5 w-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden relative"
              >
                <input
                  type="color"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                />
                <Palette className="h-3 w-3 text-gray-400 pointer-events-none" />
              </label>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <ToolbarButton
          title="Quitar formato"
          disabled={disabled}
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
        >
          <Eraser className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
