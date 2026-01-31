import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { FolderOpen, Loader2, Music, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/formatters";

export const Route = createFileRoute("/")({
  component: DashboardComponent,
});

function DashboardComponent() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <>
      <Authenticated>
        <ProjectDashboard />
      </Authenticated>
      <Unauthenticated>
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
      </Unauthenticated>
      <AuthLoading>
        <ProjectDashboardSkeleton />
      </AuthLoading>
    </>
  );
}

function ProjectDashboard() {
  const projects = useQuery(api.projects.getUserProjects);
  const createProject = useMutation(api.projects.createProject);
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProject = async () => {
    setIsCreating(true);
    try {
      const projectId = await createProject({ name: "Untitled Project" });
      toast.success("Project created");
      navigate({ to: "/project/$id", params: { id: projectId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create project");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">Your music projects</p>
        </div>
        <Button onClick={handleCreateProject} disabled={isCreating}>
          {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          New Project
        </Button>
      </header>

      {projects === undefined ? (
        <ProjectDashboardSkeletonContent />
      ) : projects.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon">
            <Music />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Create your first project to get started making music.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={handleCreateProject} disabled={isCreating}>
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create Project
          </Button>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project._id}
              project={project}
              onOpen={() => navigate({ to: "/project/$id", params: { id: project._id } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: {
    _id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    role: "owner" | "collaborator";
  };
  onOpen: () => void;
}) {
  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={onOpen}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{project.name}</CardTitle>
            <CardDescription>
              {project.role === "collaborator" && "Shared · "}
              Updated {formatDate(project.updatedAt)}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            <FolderOpen className="size-4" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="size-8" />
        </div>
      </CardHeader>
    </Card>
  );
}

function ProjectDashboardSkeletonContent() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
    </div>
  );
}

function ProjectDashboardSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-5 w-36" />
        </div>
        <Skeleton className="h-9 w-28" />
      </header>
      <ProjectDashboardSkeletonContent />
    </div>
  );
}
