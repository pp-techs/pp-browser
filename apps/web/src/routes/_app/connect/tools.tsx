import { Code } from "@astryxdesign/core/Code";
import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { createFileRoute } from "@tanstack/react-router";
import { TOOLS, type ToolDoc } from "./-components/tools.ts";

export const Route = createFileRoute("/_app/connect/tools")({
  component: ConnectTools,
});

type Row = ToolDoc;

const rows: Row[] = TOOLS;
const columns: TableColumn<Row>[] = [
  {
    key: "name",
    header: "MCP tool",
    width: proportional(2, { minWidth: 260 }),
    renderCell: (tool) => <Code>{tool.name}</Code>,
  },
  { key: "purpose", header: "Purpose", width: proportional(3, { minWidth: 260 }) },
];

function ConnectTools() {
  return <Table data={rows} columns={columns} idKey="name" />;
}
