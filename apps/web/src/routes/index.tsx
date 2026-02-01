import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Music, Plus } from "lucide-react";
import { Suspense, useState } from "react";
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
import { useSuspenseQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { Authenticated, AuthLoading, Unauthenticated } from "@/components/util/auth";
import { mutators } from "@el-audio-daw/zero/mutators";
import { randomUUID } from "crypto";

export const Route = createFileRoute("/")({
  component: DashboardComponent,
});

function DashboardComponent() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <>
      <Authenticated>
        <Suspense fallback={<ProjectDashboardSkeleton />}>
          <ProjectDashboard />
        </Suspense>
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
  const z = useZero();
  const [projectsUser] = useSuspenseQuery(queries.projects.mine(), {
    suspendUntil: "complete",
  });
  const projects = projectsUser.map((u) => ({
    id: u.projectId,
    name: u.project?.name ?? "",
    createdAt: u.project?.createdAt ?? 0,
    updatedAt: u.project?.updatedAt ?? 0,
    role: u.role,
  }));
  const navigate = useNavigate();

  const handleCreateProject = async () => {
    try {
      const projectId = randomUUID();
      const projectUserId = randomUUID();
      await z.mutate(
        mutators.projects.create({
          id: projectId,
          projectUserId,
          name: "Untitled Project",
        }),
      ).client;
      toast.success("Project created");
      navigate({ to: "/project/$id", params: { id: projectId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create project");
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">Your music projects</p>
        </div>
        <Button onClick={handleCreateProject}>
          <Plus className="size-4" />
          New Project
        </Button>
      </header>

      {projects.length === 0 ? (
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
          <Button onClick={handleCreateProject}>
            <Plus className="size-4" />
            Create Project
          </Button>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            if (!project?.id) return null;
            return (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => navigate({ to: "/project/$id", params: { id: project.id } })}
              />
            );
          })}
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
    id: string;
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
