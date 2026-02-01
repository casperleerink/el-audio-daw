import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { Authenticated, AuthLoading, Unauthenticated } from "@/components/util/auth";
import { ProjectEditor } from "@/components/project/ProjectEditor";
import { ProjectEditorSkeleton } from "@/components/project/ProjectEditorSkeleton";
import { useProjectStore } from "@/stores/projectStore";
import { queries } from "@el-audio-daw/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
  pendingComponent: () => <ProjectEditorSkeleton />,
  loader: async ({ context, params }) => {
    // Wait for auth session before preloading - prevents Zero from querying with "anon" userID
    const session = await authClient.getSession();
    if (!session.data) {
      return;
    }

    const { zero } = context;

    if (!zero) {
      return;
    }
    // Preload project with all tracks, clips, effects and audio files for the project
    await zero.preload(queries.projects.byId({ id: params.id })).complete;
  },
});

function ProjectEditorPage() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <>
      <Authenticated>
        <ProjectEditorWrapper />
      </Authenticated>
      <Unauthenticated>
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
      </Unauthenticated>
      <AuthLoading>
        <ProjectEditorSkeleton />
      </AuthLoading>
    </>
  );
}

/**
 * Wrapper that initializes the project store before rendering the editor.
 * This ensures all child components can access projectId and sampleRate from the store.
 */
function ProjectEditorWrapper() {
  const { id } = Route.useParams();
  const { setProject, clearProject } = useProjectStore();

  // Query to get sample rate (project data is already preloaded)
  const [project] = useQuery(queries.projects.byId({ id }));

  // Set project context in store when project loads
  useEffect(() => {
    if (project) {
      setProject(id, project.sampleRate ?? 44100);
    }
    return () => {
      clearProject();
    };
  }, [id, project?.sampleRate, setProject, clearProject]);

  // Wait for project to load before rendering editor
  if (project === undefined) {
    return <ProjectEditorSkeleton />;
  }

  return <ProjectEditor />;
}
