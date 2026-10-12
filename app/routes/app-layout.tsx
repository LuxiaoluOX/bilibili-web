import {
  AuditOutlined,
  BarsOutlined,
  BookOutlined,
  CalendarOutlined,
  DashboardOutlined,
  KeyOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  BgColorsOutlined,
  CloudSyncOutlined,
  FundProjectionScreenOutlined,
} from "@ant-design/icons";
import { ProConfigProvider, ProLayout } from "@ant-design/pro-components";
import { Avatar, Badge, Dropdown, Space, Typography } from "antd";
import type { MenuProps } from "antd";
import { Form, Link, Outlet, useLocation, useNavigation } from "react-router";
import type { Route } from "./+types/app-layout";
import { requireUser } from "../lib/auth.server";
import { ROLE_LABELS } from "../lib/domain";
import { proLayoutToken } from "../theme";
import { ActionButton } from "../components/actions/action-button";

export async function loader({ request }: Route.LoaderArgs) {
  return { user: await requireUser(request) };
}

function createNavigationRoute(isAdmin: boolean) { return {
  path: "/",
  routes: [
    { path: "/asset", name: "数据资产", type: "group", routes: [
      { path: "/builds", name: "武器码字典", icon: <BookOutlined /> },
      { path: "/creators", name: "创作者情报", icon: <TeamOutlined /> },
    ] },
    { path: "/core", name: "核心工作", type: "group", routes: [
      { path: "/", name: "抓取作战台", icon: <DashboardOutlined /> },
      { path: "/reviews", name: "数据审核", icon: <SafetyCertificateOutlined /> },
      { path: "/runs", name: "抓取任务", icon: <BarsOutlined /> },
      { path: "/quality", name: "数据质量", icon: <FundProjectionScreenOutlined /> },
    ] },
    { path: "/security", name: "系统与安全", type: "group", routes: [
      { path: "/bilibili-session", name: "B站会话", icon: <KeyOutlined /> },
      { path: "/users", name: "权限管理", icon: <UserOutlined /> },
      { path: "/audit", name: "操作日志", icon: <AuditOutlined /> },
      { path: "/settings", name: "系统设置", icon: <SettingOutlined /> },
      ...(isAdmin ? [{ path: "/season-sync", name: "赛季同步", icon: <CloudSyncOutlined /> }] : []),
      ...(isAdmin ? [{ path: "/design-system", name: "组件规范", icon: <BgColorsOutlined /> }] : []),
    ] },
  ],
}; }

function Logo() {
  return <img src="/brand/delta-force-icon.png" alt="三角洲行动" />;
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const navigation = useNavigation();
  const user = loaderData.user;
  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Shanghai",
  }).format(new Date());
  const accountMenu: MenuProps = {
    items: [{
      key: "logout",
      label: (
        <Form method="post" action="/logout">
          <ActionButton kind="tertiary" scale="row" htmlType="submit" icon={<LogoutOutlined />}>退出登录</ActionButton>
        </Form>
      ),
    }],
  };
  const accountControl = () => (
    <Dropdown menu={accountMenu} trigger={["click"]}>
      <button className="pro-user-menu" type="button" aria-label="打开账户菜单">
        <Avatar size={34} icon={<UserOutlined />} />
        <span><Typography.Text strong>{user.displayName}</Typography.Text><small>{ROLE_LABELS[user.role]}</small></span>
      </button>
    </Dropdown>
  );

  return (
    <ProConfigProvider hashed={false}>
      <ProLayout
      className="workbench-layout"
      layout="side"
      fixedHeader
      fixSiderbar
      contentWidth="Fluid"
      siderWidth={240}
      defaultCollapsed={false}
      collapsedButtonRender={false}
      breakpoint="lg"
      title="三角洲行动"
      logo={<Logo />}
      route={createNavigationRoute(user.role === "admin")}
      location={{ pathname: location.pathname }}
      token={proLayoutToken}
      menu={{ type: "group", autoClose: false }}
      menuItemRender={(item, dom) => item.path ? <Link to={item.path} prefetch="intent">{dom}</Link> : dom}
      menuHeaderRender={() => (
        <Link to="/" prefetch="intent" className="pro-brand">
          <span className="pro-brand-logo"><Logo /></span>
          <span className="pro-brand-copy">三角洲行动<small>数据情报工作台</small></span>
        </Link>
      )}
      headerContentRender={() => <div className="mobile-header-account">{accountControl()}</div>}
      actionsRender={false}
    >
      <header className="workbench-topbar">
        <Space className="header-date" size={6}><CalendarOutlined />{dateLabel}</Space>
        <Badge status="success" text="Asia/Shanghai" className="header-zone" />
        {accountControl()}
      </header>
      {navigation.state !== "idle" ? <div className="global-progress" aria-label="页面加载中"><i /></div> : null}
      <Outlet />
      </ProLayout>
    </ProConfigProvider>
  );
}
