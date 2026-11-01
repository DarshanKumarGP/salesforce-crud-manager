// Which fields to show per object (5-10 each). Labels, types, picklists and
// required/read-only flags come live from Salesforce's describe API.
module.exports = {
  Account:     { fields: ['Name','Type','Industry','Phone','Website','BillingCity','AnnualRevenue','Rating'], search: ['Name'], title: ['Name'] },
  Opportunity: { fields: ['Name','StageName','CloseDate','Amount','Type','LeadSource','NextStep'], search: ['Name'], title: ['Name'] },
  Lead:        { fields: ['FirstName','LastName','Company','Email','Phone','Status','LeadSource','Industry'], search: ['FirstName','LastName','Company','Email'], title: ['FirstName','LastName'] },
  Contact:     { fields: ['FirstName','LastName','Email','Phone','Title','Department','MailingCity'], search: ['FirstName','LastName','Email'], title: ['FirstName','LastName'] },
  Case:        { fields: ['CaseNumber','Subject','Status','Priority','Origin','Type','Reason','Description'], search: ['Subject','CaseNumber'], title: ['CaseNumber','Subject'] }
};
