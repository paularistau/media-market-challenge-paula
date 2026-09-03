export const employeeTypeDefs = /* GraphQL */ `
  type Employee {
    id: ID!
    name: String!
    code: String!
  }

  extend type Query {
    "All employees who can be assigned to orders."
    employees: [Employee!]!
  }
`;
