import { DatabaseOutlined, LockOutlined } from "@ant-design/icons";
import { Link, Outlet } from "react-router";
import { ActionButton } from "../components/actions";

export default function PublicLayout() {
  return <div className="public-library-shell">
    <header className="public-library-header">
      <Link className="public-library-brand" to="/library">
        <span><img src="/brand/delta-force-icon.png" alt="" /></span>
        <strong>三角洲行动码库<small>公开只读 · 来源可追溯</small></strong>
      </Link>
      <nav aria-label="公开码库导航">
        <Link to="/library"><DatabaseOutlined /> 码库</Link>
        <ActionButton kind="tertiary" scale="row" to="/login" icon={<LockOutlined />}>管理后台</ActionButton>
      </nav>
    </header>
    <Outlet />
    <footer className="public-library-footer">
      <span>数据来自白名单创作者公开发布的视频简介</span>
      <span>改枪码可能随游戏版本变化，请结合来源发布时间使用</span>
    </footer>
  </div>;
}
