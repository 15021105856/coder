export function Methodology() {
  return (
    <div className="stack method-page">
      <header className="page-head">
        <div>
          <p className="kicker">学习设计 · 静态说明</p>
          <h1>方法论</h1>
          <p className="muted">本页不产生 attempt，不影响 evidence，仅说明程序如何组织背诵与复测。</p>
        </div>
      </header>

      <section className="card">
        <h2>核心目标</h2>
        <p>把依赖从<strong>全文</strong>逐步压到<strong>小标题</strong>，最终达到<strong>无提示提取</strong>。</p>
      </section>

      <section className="card">
        <h2>A 册与 B 册分工</h2>
        <ul className="schedule">
          <li><strong>A 册</strong> = 考场输出层（完整答案、默写标准）</li>
          <li><strong>B 册</strong> = 提示层 / 网络层 / 覆盖层（骨架、关联、红线）</li>
        </ul>
      </section>

      <section className="card">
        <h2>单题流程</h2>
        <ol className="schedule">
          <li>无提示首测（闭卷草稿）</li>
          <li>已确认 B 骨架</li>
          <li>源文小标题</li>
          <li>已审核关键词</li>
          <li>完整原文对照</li>
          <li>撤提示复述</li>
        </ol>
      </section>

      <section className="card">
        <h2>证据四态</h2>
        <ul className="schedule">
          <li><span className="evidence-independent">独立提取</span></li>
          <li><span className="evidence-minor_omission">基本提取</span></li>
          <li><span className="evidence-cue_dependent">提示依赖</span></li>
          <li><span className="evidence-relearned">重新学习</span></li>
        </ul>
        <p className="muted">主观信心与客观证据分开记录；看完完整原文后不能判为独立提取。</p>
      </section>

      <section className="card">
        <h2>优先级（排程与到期）</h2>
        <p>A 级 &gt; 真题命中 B &gt; 老师高频 B &gt; 当前失败题 &gt; 普通 B</p>
      </section>

      <section className="card">
        <h2>揭晓前草稿原则</h2>
        <p>对照原文前写下的骨架会冻结；核对勾选的是「揭晓前草稿里是否已有」，不是看完答案后的感觉。</p>
      </section>

      <section className="card">
        <h2>体育例证与 examReady</h2>
        <p>体育例证勾选与「答案完整性 / examReady」分开；sportsExampleMissing 不自动等于 evidence 降级。</p>
      </section>

      <section className="card">
        <h2>晚间随机闭卷</h2>
        <p>一日计划中可预留晚间闭卷验收；题目跨章打乱，限时只封存作答阶段用时。</p>
      </section>

      <section className="card">
        <h2>复测间隔</h2>
        <p>30–60 分钟 · 次日 · 第 3 天 · 第 7 天（由间隔设置与 evidence 状态共同决定 dueAt）。</p>
      </section>

      <section className="card warnbox">
        <h2>三条铁律</h2>
        <ol className="schedule">
          <li><strong>先想再看</strong> — 无提示草稿在前</li>
          <li><strong>看完必遮</strong> — 撤提示复述检验重现</li>
          <li><strong>晚上必测</strong> — 闭卷验收留痕</li>
        </ol>
      </section>

      <section className="card">
        <h2>一天建议时间框架</h2>
        <ul className="schedule">
          <li>白天：A 核心 + 到期 B（按今日计划块执行，含休息间隔）</li>
          <li>碎片：错漏复测队列</li>
          <li>晚间：随机闭卷（可配置分钟，保护晚测时不挤掉）</li>
        </ul>
        <p className="muted">具体分钟数在「设置数据」中可调；本页不写入学习记录。</p>
      </section>
    </div>
  )
}
