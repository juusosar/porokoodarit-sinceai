import { createFileRoute } from "@tanstack/react-router";
import { ClubBench } from "@/components/ClubBench";

// Dev benchmark page (POR-10), not linked from the flow. autoCodeSplitting keeps onnxruntime-web out of the main bundle.
export const Route = createFileRoute("/bench/club")({ component: ClubBench });
