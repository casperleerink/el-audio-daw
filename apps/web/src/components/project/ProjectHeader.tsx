import { ArrowLeft, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useZero } from "@rocicorp/zero/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mutators } from "@el-audio-daw/zero/mutators";
import { useProjectId } from "@/stores/projectStore";
import { useProjectData } from "@/hooks/project/useProjectData";

export function ProjectHeader() {
  const z = useZero();
  const navigate = useNavigate();
  const projectId = useProjectId();
  const { project } = useProjectData();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState("");

  // Update project name when project loads
  useEffect(() => {
    if (project) {
      setProjectName(project.name);
    }
  }, [project]);

  const handleSaveProjectName = useCallback(async () => {
    if (!project || !projectId || projectName === project.name) {
      setSettingsOpen(false);
      return;
    }

    setSettingsOpen(false);
    await z.mutate(mutators.projects.update({ id: projectId, name: projectName }));
  }, [z, projectId, projectName, project]);

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b px-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium">{project?.name ?? ""}</span>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <Settings className="size-4" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
            <DialogDescription>Update your project settings</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={projectName}
              maxLength={50}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSaveProjectName();
                }
              }}
            />
            {projectName.length >= 40 && (
              <p
                className={`text-xs ${
                  projectName.length >= 50 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {projectName.length}/50 characters
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSaveProjectName}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
