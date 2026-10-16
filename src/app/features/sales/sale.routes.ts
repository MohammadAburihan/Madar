import { Route } from '@angular/router';
import { saleLeaveGuard } from './containers/sale-flow.container';

export const saleRoutes: Route = {
  path: 'sales/new',
  loadComponent: () => import('./containers/sale-flow.container').then((m) => m.SaleFlowContainer),
  canDeactivate: [saleLeaveGuard],
  children: [
    {
      path: '',
      pathMatch: 'full',
      loadComponent: () =>
        import('./containers/sale-customer.container').then((m) => m.SaleCustomerContainer),
    },
    {
      path: 'items',
      loadComponent: () =>
        import('./containers/sale-items.container').then((m) => m.SaleItemsContainer),
    },
    {
      path: 'basket',
      loadComponent: () =>
        import('./containers/sale-basket.container').then((m) => m.SaleBasketContainer),
    },
    {
      path: 'review',
      loadComponent: () =>
        import('./containers/sale-review.container').then((m) => m.SaleReviewContainer),
    },
    {
      path: 'receipt',
      loadComponent: () =>
        import('./containers/sale-receipt.container').then((m) => m.SaleReceiptContainer),
    },
    {
      path: 'checking',
      loadComponent: () =>
        import('./containers/sale-checking.container').then((m) => m.SaleCheckingContainer),
    },
    {
      path: 'customer/new',
      loadComponent: () =>
        import('./containers/sale-quick-customer.container').then(
          (m) => m.SaleQuickCustomerContainer,
        ),
    },
    {
      path: 'line/:index',
      loadComponent: () =>
        import('./containers/sale-line.container').then((m) => m.SaleLineContainer),
    },
    {
      path: 'stock/:index',
      loadComponent: () =>
        import('./containers/sale-stock-check.container').then((m) => m.SaleStockCheckContainer),
    },
  ],
};

export const invoiceRoute: Route = {
  path: 'sales/invoices/:name',
  loadComponent: () =>
    import('./containers/invoice-detail.container').then((m) => m.InvoiceDetailContainer),
};

export const salesRecordsRoute: Route = {
  path: 'sales',
  pathMatch: 'full',
  loadComponent: () => import('./containers/sales.container').then((m) => m.SalesContainer),
};

export const quotationRoutes: Route[] = [
  {
    path: 'sales/quote/new',
    loadComponent: () =>
      import('./containers/quotation-flow.container').then((m) => m.QuotationFlowContainer),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./containers/quotation-form.container').then((m) => m.QuotationFormContainer),
      },
      {
        path: 'checking',
        loadComponent: () =>
          import('./containers/quotation-checking.container').then(
            (m) => m.QuotationCheckingContainer,
          ),
      },
    ],
  },
  {
    path: 'sales/quotes/:name',
    loadComponent: () =>
      import('./containers/quotation.container').then((m) => m.QuotationContainer),
  },
];
