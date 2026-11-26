import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { BUSINESS_OUTCOMES, businessOutcomeLabel, useBusiness, type BusinessOutcome } from '../business'
import { useDirectory } from '../directory'
import {
  PORTFOLIO_SOURCE,
  lessonText,
  datesFromYear,
  historyBusinessName,
  planPortfolio,
  rowsFromSheet,
  type HistoryDraft,
} from '../portfolioImport'
import { useRecordSource } from '../records'
import { useUI } from '../ui'

const PLAN_LABEL = { new: '등록', same: '이미 있음', error: '제외' }

function patch(rows: HistoryDraft[], index: number, partial: Partial<HistoryDraft>) {
  return rows.map((row) => (row.index === index ? { ...row, ...partial } : row))
}

export function PortfolioImport() {
  const { go } = useUI()
  const directory = useDirectory()
  const records = useRecordSource()
  const portfolio = useBusiness()
  const [rows, setRows] = useState<HistoryDraft[]>([])
  const [fileName, setFileName] = useState('')
  const [readError, setReadError] = useState('')
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [summary, setSummary] = useState('')
  const [failed, setFailed] = useState<{ index: number; message: string }[]>([])

  function recheck() {
    setRows((current) => {
      const planned = planPortfolio(
        current,
        records.companies.map((item) => ({ id: item.id, name: item.name })),
        portfolio.businesses.map((item) => ({
          companyId: item.companyId,
          name: item.name,
          program: item.program,
          fiscalYear: item.fiscalYear,
        })),
      )
      return planned.map((row, index) => ({ ...row, include: current[index]?.include && row.plan === 'new' }))
    })
  }

  const chosen = rows.filter((row) => row.include && row.plan === 'new')
  const counts = useMemo(() => {
    return {
      fresh: rows.filter((row) => row.plan === 'new').length,
      same: rows.filter((row) => row.plan === 'same').length,
      review: rows.filter((row) => row.needsReview).length,
    }
  }, [rows])

  function load(file: File) {
    setReadError('')
    setSummary('')
    setFailed([])
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const book = XLSX.read(reader.result, { type: 'array' })
        const sheet = book.Sheets[book.SheetNames[0]]
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
        const parsed = rowsFromSheet(matrix)
        if (parsed.length === 0) {
          setRows([])
          setReadError('기업·기관명 머리글을 찾지 못했습니다. 통합 목록 시트를 선택해 주세요.')
          return
        }
        setRows(
          planPortfolio(
            parsed,
            records.companies.map((item) => ({ id: item.id, name: item.name })),
            portfolio.businesses.map((item) => ({
              companyId: item.companyId,
              name: item.name,
              program: item.program,
              fiscalYear: item.fiscalYear,
            })),
          ),
        )
        setFileName(file.name)
      } catch {
        setRows([])
        setReadError('엑셀을 읽지 못했습니다. xlsx 파일인지 확인해 주세요.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function register() {
    if (chosen.length === 0 || progress) return
    if (!records.remote || !portfolio.remote) {
      setReadError('팀 데이터베이스에 로그인한 뒤 등록할 수 있습니다.')
      return
    }
    if (!directory.extended || !portfolio.extended) {
      setReadError('사업 이력 항목이 아직 준비되지 않았습니다. portfolio.sql 실행 후 새로고침해 주세요.')
      return
    }
    setFailed([])
    setSummary('')
    setProgress([0, chosen.length])
    const companyIds = new Map<string, string>()
    for (const company of records.companies) companyIds.set(company.name, company.id)
    const errors: { index: number; message: string }[] = []
    let createdCompanies = 0
    let createdBusinesses = 0
    let done = 0
    for (const row of chosen) {
      try {
        const known = records.companies.find((item) => item.id === row.companyId)
        let companyId = row.companyId ?? ''
        if (!companyId) {
          const cached = [...companyIds.entries()].find(([name]) => name === row.companyName)
          companyId = cached?.[1] ?? ''
        }
        if (!companyId) {
          companyId = await records.saveCompany({
            name: row.companyName,
            industry: row.industry,
            website: row.website,
            phone: row.contactName ? '' : row.phone,
            address: '',
            summary: '',
            relation: row.relation,
            needsReview: row.needsReview,
            reviewNote: row.reviewNote,
            lastContact: row.lastContact || null,
            priority: row.priority,
            source: PORTFOLIO_SOURCE,
          })
          companyIds.set(row.companyName, companyId)
          createdCompanies += 1
        } else if (known) {
          await records.saveCompany({
            id: known.id,
            name: known.name,
            industry: known.industry || row.industry,
            website: known.website || row.website,
            phone: known.phone || (row.contactName ? '' : row.phone),
            address: known.address,
            summary: known.summary,
            relation: known.relation || row.relation,
            needsReview: known.needsReview || row.needsReview,
            reviewNote: known.reviewNote || row.reviewNote,
            lastContact: known.lastContact || row.lastContact || null,
            priority: known.priority || row.priority,
            source: known.source || PORTFOLIO_SOURCE,
          })
        }
        if (row.contactName) {
          const exists = records.contacts.some((item) => item.companyId === companyId && item.name === row.contactName)
          if (!exists) {
            await records.saveContact({
              companyId,
              name: row.contactName,
              department: '',
              position: '',
              email: row.email,
              phone: row.phone,
              memo: '',
            })
          }
        }
        const dates = datesFromYear(row.fiscalYear)
        await portfolio.saveBusiness({
          name: historyBusinessName(row),
          overview: row.item,
          type: row.businessType,
          status: row.businessStatus,
          startDate: dates.startDate,
          endDate: dates.endDate,
          companyId,
          targetContactIds: [],
          stakeholderIds: [],
          program: row.program,
          item: row.item,
          fiscalYear: row.fiscalYear,
          outcome: row.outcome,
          myRole: row.relation,
          evidence: row.evidence,
          reviewNote: row.reviewNote,
          needsReview: row.needsReview,
          amount: row.amount,
          matchingRoute: '',
          lessons: lessonText(row),
          source: PORTFOLIO_SOURCE,
        })
        createdBusinesses += 1
      } catch (error) {
        errors.push({ index: row.index, message: error instanceof Error ? error.message : '저장하지 못했습니다.' })
      }
      done += 1
      setProgress([done, chosen.length])
    }
    await directory.refresh()
    await portfolio.refresh()
    setFailed(errors)
    setSummary(`고객사 ${createdCompanies}곳, 사업 이력 ${createdBusinesses}건을 등록했습니다.`)
    setProgress(null)
    setRows((current) => current.map((row) => (row.include && row.plan === 'new' && !errors.some((item) => item.index === row.index) ? { ...row, include: false, plan: 'same', message: '이번 등록으로 저장했습니다.' } : row)))
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>엑셀 이관</h1>
          <p className="page-intro">파일을 이 브라우저에서만 읽고, 행을 고친 뒤 등록합니다. 등록 후에는 고객사·사업 화면에서 다시 수정할 수 있습니다.</p>
        </div>
        <button type="button" className="btn ghost" onClick={() => go({ name: 'companies' })}>
          고객사 목록
        </button>
      </div>
      <div className="card pad">
        <label className="btn ghost file-btn">
          엑셀 선택
          <input
            type="file"
            accept=".xlsx,.xls"
            aria-label="이관 엑셀"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) load(file)
            }}
          />
        </label>
        {fileName && <p className="hint">{fileName} · {rows.length}행</p>}
        {readError && <p className="error">{readError}</p>}
      </div>
      {rows.length > 0 && (
        <>
          <div className="import-counts">
            <span>등록 대상 {counts.fresh}</span>
            <span>이미 있음 {counts.same}</span>
            <span>검토 필요 {counts.review}</span>
          </div>
          <div className="import-table-wrap portfolio-table">
            <table className="import-table">
              <thead>
                <tr>
                  <th aria-label="선택" />
                  <th>상태</th>
                  <th>기업·기관</th>
                  <th>관계</th>
                  <th>연도</th>
                  <th>관련 사업</th>
                  <th>아이템</th>
                  <th>결과</th>
                  <th>검토</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.index} className={`import-row ${row.plan === 'new' ? 'new' : row.plan}`}>
                    <td>
                      {row.plan === 'new' && (
                        <input
                          type="checkbox"
                          aria-label={`${row.index + 1}번째 행 선택`}
                          checked={row.include}
                          onChange={() => setRows((current) => patch(current, row.index, { include: !row.include }))}
                        />
                      )}
                    </td>
                    <td>
                      <span className={`import-status ${row.plan === 'new' ? 'new' : row.plan === 'error' ? 'error' : 'same'}`}>{PLAN_LABEL[row.plan]}</span>
                      <small>{row.message}</small>
                    </td>
                    <td>
                      <input className="grid-input" aria-label="기업·기관" value={row.companyName} onChange={(event) => setRows((current) => patch(current, row.index, { companyName: event.target.value }))} />
                    </td>
                    <td>
                      <input className="grid-input" aria-label="관계" value={row.relation} onChange={(event) => setRows((current) => patch(current, row.index, { relation: event.target.value }))} />
                    </td>
                    <td>
                      <input className="grid-input" aria-label="연도" value={row.fiscalYear} onChange={(event) => setRows((current) => patch(current, row.index, { fiscalYear: event.target.value }))} />
                    </td>
                    <td>
                      <input className="grid-input" aria-label="관련 사업" value={row.program} onChange={(event) => setRows((current) => patch(current, row.index, { program: event.target.value, businessName: [event.target.value && row.fiscalYear, event.target.value].filter(Boolean).join(' ') || row.businessName }))} />
                    </td>
                    <td>
                      <input className="grid-input" aria-label="아이템" value={row.item} onChange={(event) => setRows((current) => patch(current, row.index, { item: event.target.value }))} />
                    </td>
                    <td>
                      <select
                        className="input"
                        aria-label="결과"
                        value={row.outcome}
                        onChange={(event) => setRows((current) => patch(current, row.index, { outcome: event.target.value as BusinessOutcome }))}
                      >
                        {BUSINESS_OUTCOMES.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={row.needsReview}
                          onChange={(event) => setRows((current) => patch(current, row.index, { needsReview: event.target.checked }))}
                        />
                        {row.needsReview ? '필요' : '없음'}
                      </label>
                      {row.reviewNote && <small>{row.reviewNote}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">결과 칸의 기본값은 “{businessOutcomeLabel('completed')}”, “{businessOutcomeLabel('applied')}”처럼 상태 문구에서 읽은 값입니다. 등록 전에 바꿔도 됩니다.</p>
          {summary && <p className="hint">{summary}</p>}
          {failed.length > 0 && (
            <ul className="import-failed">
              {failed.map((item) => (
                <li key={item.index}>
                  {item.index + 1}번째 행 · {item.message}
                </li>
              ))}
            </ul>
          )}
          <div className="button-row">
            <button type="button" className="btn ghost" onClick={recheck} disabled={Boolean(progress)}>
              기존 데이터와 다시 비교
            </button>
            <button type="button" className="btn primary" disabled={chosen.length === 0 || Boolean(progress)} onClick={() => void register()}>
              {progress ? `${progress[0]} / ${progress[1]} 저장 중` : chosen.length > 0 ? `${chosen.length}건 등록` : '등록할 행이 없습니다'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
