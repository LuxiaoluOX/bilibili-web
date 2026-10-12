import { ProTable } from "@ant-design/pro-components";
import type { ProColumns, ProTableProps } from "@ant-design/pro-components";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table";

export type WorkbenchColumnState = Record<string, { show?: boolean; fixed?: "left" | "right" }>;

export function tablePagination(pageSize = 12, unit = "条"): TablePaginationConfig {
  return {
    defaultPageSize: pageSize,
    responsive: true,
    showSizeChanger: true,
    pageSizeOptions: [10, 12, 20, 50],
    showLessItems: true,
    hideOnSinglePage: true,
    placement: ["bottomEnd"],
    showTotal: (total: number, range: [number, number]) => `第 ${range[0]}–${range[1]} ${unit}，共 ${total} ${unit}`,
  };
}
export function WorkbenchProTable<T extends object>({
  preferenceKey,
  columns,
  ...props
}: Omit<ProTableProps<T, Record<string, never>>, "columns"> & {
  preferenceKey: string;
  columns: ProColumns<T>[] | ColumnsType<T>;
}) {
  return (
    <ProTable<T, Record<string, never>>
      {...props}
      className={`workbench-pro-table ${props.className ?? ""}`}
      columns={columns as ProColumns<T>[]}
      search={false}
      rowKey={props.rowKey ?? "id"}
      cardBordered={false}
      options={props.options === false ? false : { density: true, setting: true, fullScreen: true, reload: false }}
      columnsState={props.options === false ? undefined : {
        persistenceKey: `sjz-v2-table-${preferenceKey}`,
        persistenceType: "localStorage",
      }}
      dateFormatter="string"
    />
  );
}
