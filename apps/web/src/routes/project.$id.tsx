import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorComponent,
});

function ProjectEditorComponent() {
  const { id } = Route.useParams();

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">DAW Editor for project {id} - Coming soon</p>
    </div>
  );
}
