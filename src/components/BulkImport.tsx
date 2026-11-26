import { useEffect, useMemo, useState } from 'react'
import {
  COMPANY_FIELDS,
  CONTACT_FIELDS,
  STATUS_LABEL,
  countByStatus,
  parseCompanyTable,
  parseContactTable,
  planCompanies,
  planContacts,
  runCompanyPlan,
  runContactPlan,
  type ImportKind,
  type ImportSummary,
  type PlanStatus,
} from '../importTable'
import { useRecordSource } from '../records'

const SAMPLE: Record<ImportKind, string> = {
  companies: '고객사명\t업종\t홈페이지\t대표 연락처\n테스\t반도체 장비\thttps://example.com\t02-000-0000',
  contacts: '고객사\t이름\t부서\t직급\t이메일\t연락처\n테스\t이성웅\t사업기획\t책임\tname@example.com\t010-0000-0000',
}

function selectable(status: PlanStatus) {
  return status === 'new' || status === 'update'
}

export function BulkImport({ initialKind, onClose }: { initialKind: ImportKind; onClose: () => void }) {
  const records = useRecordSource()
  const [kind, setKind] = useState<ImportKind>(initialKind)
  const [text, setText] = useState('')
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !progress) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, progress])

  const companyTable = useMemo(() => parseCompanyTable(kind === 'companies' ? text : ''), [kind, text])
  const contactTable = useMemo(() => parseContactTable(kind === 'contacts' ? text : ''), [kind, text])
  const companyPlans = useMemo(
    () => planCompanies(companyTable.rows, records.companies),
    [companyTable, records.companies],
  )
  const contactPlans = useMemo(
    () => planContacts(contactTable.rows, records.companies, records.contacts),
    [contactTable, records.companies, records.contacts],
  )

  const plans = kind === 'companies' ? companyPlans : contactPlans
  const table = kind === 'companies' ? companyTable : contactTable
  const counts = countByStatus(plans)
  const chosen = plans.filter((plan) => selectable(plan.status) && !excluded.has(plan.index))
  const newCompanies = new Set(
    contactPlans
      .filter((plan) => kind === 'contacts' && plan.newCompany && !excluded.has(plan.index) && selectable(plan.status))
      .map((plan) => plan.companyName),
  ).size

  function switchKind(next: ImportKind) {
    if (progress) return
    setKind(next)
    setExcluded(new Set())
    setSummary(null)
    setError('')
  }

  function change(value: string) {
    setText(value)
    setExcluded(new Set())
    setSummary(null)
    setError('')
  }

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function run() {
    if (chosen.length === 0 || progress) return
    setError('')
    setProgress([0, chosen.length])
    const selected = new Set(chosen.map((plan) => plan.index))
    const runner = { saveCompany: records.saveCompany, saveContact: records.saveContact }
    const onProgress = (done: number, total: number) => setProgress([done, total])
    try {
      const result =
        kind === 'companies'
          ? await runCompanyPlan(companyPlans, selected, runner, onProgress)
          : await runContactPlan(contactPlans, selected, runner, onProgress)
      setSummary(result)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setProgress(null)
    }
  }

  const fields = kind === 'companies' ? COMPANY_FIELDS : CONTACT_FIELDS
  const defaultOrder = fields.map((field) => field.label).join(', ')

  return (
    <div className="backdrop">
      <div className="modal import-panel" role="dialog" aria-modal="true" aria-label="붙여넣기 등록">
        <header className="modal-head">
          <div>
            <h2>붙여넣기로 한꺼번에 등록</h2>
            <p className="cal-sub">엑셀이나 표에서 복사(Ctrl+C)한 내용을 붙여 넣으면 한 번에 등록됩니다.</p>
          </div>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose} disabled={Boolean(progress)}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="quick-choices import-tabs">
            <button type="button" className="quick-choice" aria-pressed={kind === 'companies'} onClick={() => switchKind('companies')}>
              고객사
            </button>
            <button type="button" className="quick-choice" aria-pressed={kind === 'contacts'} onClick={() => switchKind('contacts')}>
              담당자 (고객사 포함)
            </button>
          </div>

          {summary ? (
            <div className="import-done">
              <h3>등록을 마쳤습니다.</h3>
              <p>
                신규 {summary.created}건
                {summary.companiesCreated > 0 ? ` · 새 고객사 ${summary.companiesCreated}곳` : ''} · 보완 {summary.updated}건
              </p>
              {summary.failed.length > 0 && (
                <div>
                  <p className="error">저장하지 못한 행이 {summary.failed.length}건 있습니다. 같은 내용을 다시 붙여 넣으면 남은 행만 등록됩니다.</p>
                  <ul className="import-failed">
                    {summary.failed.map((item) => (
                      <li key={item.index}>
                        {item.index + 1}번째 행 · {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="button-row">
                <button type="button" className="btn ghost" onClick={() => change('')}>
                  이어서 붙여넣기
                </button>
                <button type="button" className="btn primary" onClick={onClose}>
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                className="textarea import-text"
                value={text}
                placeholder={SAMPLE[kind]}
                aria-label="붙여넣을 내용"
                onChange={(event) => change(event.target.value)}
                autoFocus
              />
              <p className="hint">
                첫 줄이 머리글이면 열 순서가 달라도 맞춰 읽습니다. 머리글이 없으면 {defaultOrder} 순서로 읽습니다. 한 번에 최대 500행까지 가능합니다.
              </p>

              {plans.length > 0 && (
                <>
                  {!table.hasHeader && <p className="hint">머리글을 찾지 못해 기본 열 순서로 읽었습니다.</p>}
                  {table.truncated && <p className="error">500행을 넘는 내용은 제외했습니다. 나누어 등록해 주세요.</p>}
                  <div className="import-counts">
                    <span>신규 {counts.new}</span>
                    <span>보완 {counts.update}</span>
                    <span>동일 {counts.same}</span>
                    <span>중복 {counts.skip}</span>
                    <span>확인 필요 {counts.error}</span>
                  </div>
                  <div className="import-table-wrap">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th aria-label="선택" />
                          <th>상태</th>
                          {kind === 'companies' ? (
                            <>
                              <th>고객사명</th>
                              <th>업종</th>
                              <th>홈페이지</th>
                              <th>연락처</th>
                            </>
                          ) : (
                            <>
                              <th>고객사</th>
                              <th>이름</th>
                              <th>부서</th>
                              <th>직급</th>
                              <th>이메일</th>
                              <th>연락처</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {kind === 'companies'
                          ? companyPlans.map((plan) => (
                              <tr key={plan.index} className={`import-row ${plan.status}`}>
                                <td>
                                  {selectable(plan.status) && (
                                    <input
                                      type="checkbox"
                                      aria-label={`${plan.index + 1}번째 행 선택`}
                                      checked={!excluded.has(plan.index)}
                                      onChange={() => toggle(plan.index)}
                                    />
                                  )}
                                </td>
                                <td>
                                  <span className={`import-status ${plan.status}`}>{STATUS_LABEL[plan.status]}</span>
                                  {plan.message && <small>{plan.message}</small>}
                                </td>
                                <td>{plan.input.name}</td>
                                <td>{plan.input.industry}</td>
                                <td>{plan.input.website}</td>
                                <td>{plan.input.phone}</td>
                              </tr>
                            ))
                          : contactPlans.map((plan) => (
                              <tr key={plan.index} className={`import-row ${plan.status}`}>
                                <td>
                                  {selectable(plan.status) && (
                                    <input
                                      type="checkbox"
                                      aria-label={`${plan.index + 1}번째 행 선택`}
                                      checked={!excluded.has(plan.index)}
                                      onChange={() => toggle(plan.index)}
                                    />
                                  )}
                                </td>
                                <td>
                                  <span className={`import-status ${plan.status}`}>{STATUS_LABEL[plan.status]}</span>
                                  {plan.message && <small>{plan.message}</small>}
                                </td>
                                <td>{plan.companyName}</td>
                                <td>{plan.input.name}</td>
                                <td>{plan.input.department}</td>
                                <td>{plan.input.position}</td>
                                <td>{plan.input.email}</td>
                                <td>{plan.input.phone}</td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {error && <p className="error">{error}</p>}
            </>
          )}
        </div>
        {!summary && (
          <footer className="modal-foot">
            <div className="foot-bar">
              {progress && (
                <span className="import-progress">
                  {progress[0]} / {progress[1]} 저장 중
                </span>
              )}
              <button type="button" className="btn ghost" onClick={onClose} disabled={Boolean(progress)}>
                취소
              </button>
              <button type="button" className="btn primary" onClick={() => void run()} disabled={chosen.length === 0 || Boolean(progress)}>
                {chosen.length > 0
                  ? `${chosen.length}건 등록${newCompanies > 0 ? ` (새 고객사 ${newCompanies}곳 포함)` : ''}`
                  : '등록할 내용이 없습니다'}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}
