import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth.guard';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./features/login/login').then(m => m.Login),
    },
    {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () => import('./features/dashboard/layout/dashboard-layout').then(m => m.DashboardLayoutComponent),
        children: [
            {
                path: '',
                loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
            },
            {
                path: 'preview/:id',
                loadComponent: () => import('./features/dashboard/components/preview/preview').then(m => m.PreviewComponent),
            },
            {
                path: 'instances/:id',
                loadComponent: () => import('./features/dashboard/components/running-instances/running-instances').then(m => m.RunningInstancesComponent),
            },
            {
                path: 'archived/:id',
                loadComponent: () => import('./features/dashboard/components/archived-instances/archived-instances').then(m => m.ArchivedInstancesComponent),
            },
            {
                path: 'procedure/run/:id',
                loadComponent: () => import('./features/dashboard/components/view-procedure/view-procedure').then(m => m.ViewProcedureComponent),
            },
            {
                path: 'procedure/runninginstance/:id/:version/:revision',
                loadComponent: () => import('./features/dashboard/components/view-procedure/view-procedure').then(m => m.ViewProcedureComponent),
            },
            {
                path: 'procedure/archivedinstance/:id/:version/:revision',
                loadComponent: () => import('./features/dashboard/components/view-procedure/view-procedure').then(m => m.ViewProcedureComponent),
            }
        ]
    },
    {
        path: '**',
        redirectTo: '',
    },
];
