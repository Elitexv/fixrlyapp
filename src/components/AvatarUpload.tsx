import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadUserFile } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function AvatarUpload({
  userId,
  avatarUrl,
  label,
  className,
}: {
  userId: string;
  avatarUrl: string | null;
  label: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");

    setUploading(true);
    try {
      const url = await uploadUserFile("avatars", userId, file, "avatar");
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
      if (error) throw error;
      toast.success("Profile picture updated");
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("relative inline-block shrink-0", className)}>
      <div className="size-20 rounded-3xl bg-accent/10 overflow-hidden grid place-items-center text-accent text-2xl font-black">
        {avatarUrl ? <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" /> : label}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute -bottom-1.5 -right-1.5 size-8 rounded-full bg-brand text-white grid place-items-center shadow-lg border-2 border-white transition hover:bg-brand/90 disabled:opacity-60"
      >
        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  );
}
