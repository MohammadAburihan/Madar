import { TestBed } from '@angular/core/testing';
import { SignInFormComponent } from './sign-in-form.component';

const LABELS = {
  title: 'Welcome back',
  subtitle: 'Sign in to Rehan Nursery.',
  email: 'Email *',
  password: 'Password *',
  submit: 'Sign in',
  submitting: 'Signing in…',
  forgot: 'Forgot password?',
  footer: 'Connected to rehan.example.com',
};

describe('SignInFormComponent', () => {
  const render = async () => {
    const fixture = TestBed.createComponent(SignInFormComponent);
    fixture.componentRef.setInput('labels', LABELS);
    await fixture.whenStable();
    return fixture;
  };

  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('emits trimmed credentials on submit', async () => {
    const fixture = await render();
    const emitted: unknown[] = [];
    fixture.componentInstance.signIn.subscribe((c) => emitted.push(c));
    const [email, password] = fixture.nativeElement.querySelectorAll('input');

    type(email, '  lina@rehan.example ');
    type(password, 'secret');
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));

    expect(emitted).toEqual([{ email: 'lina@rehan.example', password: 'secret' }]);
  });

  it('shows the notice and disables submit while signing in', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('submitting', true);
    fixture.componentRef.setInput('notice', {
      tone: 'danger',
      title: 'Email or password is incorrect',
      message: 'Try again.',
    });
    await fixture.whenStable();

    const submit: HTMLButtonElement = fixture.nativeElement.querySelector('button[type=submit]');
    expect(submit.disabled).toBe(true);
    expect(submit.textContent?.trim()).toBe('Signing in…');
    expect(fixture.nativeElement.textContent).toContain('Email or password is incorrect');
  });

  it('asks for a reset with the typed email', async () => {
    const fixture = await render();
    const emitted: string[] = [];
    fixture.componentInstance.forgotPassword.subscribe((e) => emitted.push(e));

    type(fixture.nativeElement.querySelector('input[type=email]'), 'lina@rehan.example');
    fixture.nativeElement.querySelector('button[type=button]').click();

    expect(emitted).toEqual(['lina@rehan.example']);
  });
});
