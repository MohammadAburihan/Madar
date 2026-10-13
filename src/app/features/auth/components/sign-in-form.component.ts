import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { FeedbackCardComponent, FeedbackTone } from '../../../shared/ui/feedback-card.component';

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignInMessage {
  tone: FeedbackTone;
  title: string;
  message: string;
}

export interface SignInLabels {
  title: string;
  subtitle: string;
  email: string;
  password: string;
  submit: string;
  submitting: string;
  forgot: string;
  footer: string;
}

@Component({
  selector: 'app-sign-in-form',
  imports: [FeedbackCardComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ labels().title }}</h1>
    <p class="muted subtitle">{{ labels().subtitle }}</p>
    @if (notice(); as n) {
      <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <label class="field">
        <span class="label">{{ labels().email }}</span>
        <input
          class="control"
          type="email"
          formControlName="email"
          autocomplete="username"
          inputmode="email"
          dir="ltr"
        />
      </label>
      <label class="field">
        <span class="label">{{ labels().password }}</span>
        <input
          class="control"
          type="password"
          formControlName="password"
          autocomplete="current-password"
          dir="ltr"
        />
      </label>
      <button type="submit" class="md-btn md-btn--primary" [disabled]="submitting()">
        {{ submitting() ? labels().submitting : labels().submit }}
      </button>
      <button
        type="button"
        class="md-btn"
        (click)="forgotPassword.emit(form.controls.email.value.trim())"
      >
        {{ labels().forgot }}
      </button>
    </form>
    <p class="muted footer">{{ labels().footer }}</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    h1 {
      color: var(--md-ink);
      font: 600 28px / var(--md-lh) var(--md-font);
    }

    .muted {
      color: var(--md-muted);
    }

    .subtitle {
      font: 400 15px / var(--md-lh) var(--md-font);
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .label {
      color: var(--md-muted);
      font: 600 14px / var(--md-lh) var(--md-font);
    }

    .control {
      block-size: 48px;
      padding: 0 12px;
      border: 1px solid var(--md-control);
      border-radius: 8px;
      background: var(--md-surface);
      color: var(--md-ink);
      font:
        400 16px / 1.4 'Inter Variable',
        system-ui,
        sans-serif;
      text-align: start;
    }

    .footer {
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class SignInFormComponent {
  readonly labels = input.required<SignInLabels>();
  readonly submitting = input(false);
  readonly notice = input<SignInMessage | null>(null);
  readonly signIn = output<SignInCredentials>();
  readonly forgotPassword = output<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({ email: [''], password: [''] });

  protected submit(): void {
    const { email, password } = this.form.getRawValue();
    this.signIn.emit({ email: email.trim(), password });
    // The page stays cached by Ionic, so never keep a password around after submitting.
    this.form.controls.password.reset();
  }
}
