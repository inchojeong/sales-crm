import { useDirectory } from './directory'
import { useCrm } from './store'
import type { Company, CompanyInput, Contact, ContactInput } from './types'

export interface RecordSource {
  remote: boolean
  ready: boolean
  companies: Company[]
  contacts: Contact[]
  saveCompany: (input: CompanyInput) => Promise<string>
  saveContact: (input: ContactInput) => Promise<string>
}

/** 팀 데이터베이스가 연결되어 있으면 그 목록을, 아니면 이 브라우저의 목록을 돌려줍니다. */
export function useRecordSource(): RecordSource {
  const { db, saveCompany, saveContact } = useCrm()
  const directory = useDirectory()
  const remote = directory.remote
  return {
    remote,
    ready: remote ? directory.ready : true,
    companies: remote ? directory.companies : db.companies,
    contacts: remote ? directory.contacts : db.contacts,
    saveCompany: (input) => (remote ? directory.saveCompany(input) : Promise.resolve(saveCompany(input))),
    saveContact: (input) => (remote ? directory.saveContact(input) : Promise.resolve(saveContact(input))),
  }
}
