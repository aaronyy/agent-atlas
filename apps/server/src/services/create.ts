import type { AtlasDb } from "@agent-atlas/db";
import { AtlasService } from "./atlas.js";
import { ControlPlaneService } from "./control-plane.js";

export function createAtlasServices(
  db: AtlasDb,
  workspaceId: string,
  staleHours: number,
) {
  const atlas = new AtlasService(db, workspaceId, staleHours);
  const control = new ControlPlaneService(db, workspaceId, atlas, staleHours);
  atlas.controlPlane = control;
  return { atlas, control };
}
