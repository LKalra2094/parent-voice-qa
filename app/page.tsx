"use client";

import { useState, useRef, useEffect } from "react";

interface Kid {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
}

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("Tap to ask a question");
  const [kids, setKids] = useState<Kid[]>([]);
  const [selectedKid, setSelectedKid] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const conversationIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    fetch("/api/kids").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setKids(data);
    });
  }, []);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      await sendAudio(blob);
    };

    mediaRecorder.start();
    setRecording(true);
    setStatus("Listening...");
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setProcessing(true);
    setStatus("Thinking...");
  }

  function handleClick() {
    if (processing) return;
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function sendAudio(blob: Blob) {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      if (selectedKid) formData.append("kid_id", selectedKid);
      formData.append("conversation_id", conversationIdRef.current);

      const res = await fetch("/api/ask", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        setStatus("Something went wrong. Try again!");
        setProcessing(false);
        return;
      }

      const transcribed = res.headers.get("X-Transcribed-Text");
      if (transcribed) {
        setStatus(`You asked: "${decodeURIComponent(transcribed)}"`);
      }

      const audioBuffer = await res.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setStatus("Tap to ask another question");
        setProcessing(false);
      };
      audio.play();
    } catch {
      setStatus("Something went wrong. Try again!");
      setProcessing(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      {kids.length > 0 && (
        <select
          value={selectedKid}
          onChange={(e) => setSelectedKid(e.target.value)}
          className="mb-8 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
        >
          <option value="">Select a child</option>
          {kids.map((kid) => (
            <option key={kid.id} value={kid.id}>
              {kid.name}{kid.age !== null ? ` (age ${kid.age})` : ""}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={handleClick}
        disabled={processing && !recording}
        className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl transition-all ${
          recording
            ? "bg-red-500 animate-pulse scale-110"
            : processing
              ? "bg-zinc-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 hover:scale-105 active:scale-95"
        }`}
      >
        {recording ? "■" : "\uD83C\uDFA4"}
      </button>
      <p className="mt-8 text-lg text-zinc-600 dark:text-zinc-400 text-center max-w-sm">
        {status}
      </p>
    </div>
  );
}
