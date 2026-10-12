import { Drawer, Modal } from "antd";
import type { DrawerProps, ModalProps } from "antd";
import type { ReactNode } from "react";

export type FormModalProps = Omit<ModalProps, "open" | "onCancel" | "footer" | "children"> & {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function FormModal({ open, onClose, children, width = 560, ...props }: FormModalProps) {
  return (
    <Modal
      {...props}
      open={open}
      width={width}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      className={`workbench-form-modal ${props.className ?? ""}`}
    >
      {children}
    </Modal>
  );
}

export type ActionDrawerProps = Omit<DrawerProps, "open" | "onClose" | "children"> & {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function ActionDrawer({ open, onClose, children, width = 440, ...props }: ActionDrawerProps) {
  return (
    <Drawer
      {...props}
      open={open}
      size={width}
      onClose={onClose}
      destroyOnHidden
      className={`workbench-action-drawer ${props.className ?? ""}`}
    >
      {children}
    </Drawer>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  return children ? <div className="modal-form-error" role="alert">{children}</div> : null;
}
