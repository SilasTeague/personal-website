import type { Metadata } from "next";
import ChessGame from "@/features/chess/ChessGame";

export const metadata: Metadata = {
  title: "Play Dahlia — Silas Teague",
  description: "Play a game against Dahlia, a chess engine written from scratch in C++.",
};

export default function ChessPage() {
  return <ChessGame />;
}
